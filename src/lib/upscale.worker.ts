import {
  AutoModel,
  env,
  type PreTrainedModel,
  RawImage,
  Tensor,
} from "@huggingface/transformers";
import {
  type Device,
  findModel,
  type ModelKey,
  type UpscalePlan,
  type UpscaleRequest,
  type WorkerMessage,
} from "@/lib/upscale";
import {
  hasTransparency,
  type Pixels,
  planTiles,
  tileInput,
  tileOutput,
} from "@/lib/upscale-tiles";

// Models only ever come from the Hub; skip probing this site for local copies.
env.allowLocalModels = false;

// The DOM lib types `postMessage` as Window's; in a worker it's this.
const scope = self as unknown as Worker;

// Source pixels per tile side, plus context on each side that's cropped away.
// A 160px input keeps the 4× upsampler's activations around 100 MB, and with
// 16px of context the tiled result matches a whole-image run at 65 dB.
const TILE_SIZE = 128;
const TILE_MARGIN = 16;
const WARMUP_SIZE = 16;
const CHANNELS = 3;

interface Loaded {
  device: Device;
  key: ModelKey;
  model: PreTrainedModel;
}

// Only one model is kept loaded; switching models frees the previous one.
let loading: Promise<Loaded> | null = null;
let loadingKey: ModelKey | null = null;

const cancelled = new Set<number>();

async function hasWebGpu() {
  const { gpu } = navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<unknown> };
  };
  try {
    return Boolean(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

function run(model: PreTrainedModel, pixels: Float32Array, dims: number[]) {
  return model({
    pixel_values: new Tensor("float32", pixels, dims),
  }) as Promise<{
    reconstruction: Tensor;
  }>;
}

async function load(
  key: ModelKey,
  device: Device,
  onDownload: (loaded: number, total: number) => void
): Promise<Loaded> {
  const model = await AutoModel.from_pretrained(findModel(key).id, {
    device,
    dtype: "q4",
    progress_callback: (info) => {
      if (info.status === "progress_total") {
        onDownload(info.loaded, info.total);
      }
    },
  });
  // Some WebGPU drivers load the session and then fail on the first run, so
  // prove it works on a tiny input before committing to it.
  const side = WARMUP_SIZE;
  try {
    await run(model, new Float32Array(CHANNELS * side * side), [
      1,
      CHANNELS,
      side,
      side,
    ]);
  } catch (cause) {
    await model.dispose();
    throw cause;
  }
  return { device, key, model };
}

async function loadWithFallback(
  key: ModelKey,
  onDownload: (loaded: number, total: number) => void
): Promise<Loaded> {
  if (await hasWebGpu()) {
    try {
      return await load(key, "webgpu", onDownload);
    } catch {
      // Fall through to WASM; the weights are cached, so this is quick.
    }
  }
  return await load(key, "wasm", onDownload);
}

async function getModel(
  key: ModelKey,
  onDownload: (loaded: number, total: number) => void
) {
  if (loading && loadingKey !== key) {
    const previous = loading;
    loading = null;
    await previous.then(({ model }) => model.dispose()).catch(() => undefined);
  }
  loadingKey = key;
  // A failed load is forgotten so the next request can try again.
  loading ??= loadWithFallback(key, onDownload).catch((cause: unknown) => {
    loading = null;
    throw cause;
  });
  return await loading;
}

async function upscale(id: number, image: Blob, key: ModelKey) {
  const post = (message: WorkerMessage, transfer: Transferable[] = []) =>
    scope.postMessage(message, transfer);

  const [{ device, model }, decoded] = await Promise.all([
    getModel(key, (loaded, total) =>
      post({ id, loaded, total, type: "download" })
    ),
    RawImage.fromBlob(image),
  ]);
  if (cancelled.has(id)) {
    post({ id, type: "cancelled" });
    return;
  }

  const { scale } = findModel(key);
  const source: Pixels = decoded.rgba();
  const transparent = hasTransparency(source);
  const tiles = planTiles(source.width, source.height, TILE_SIZE, TILE_MARGIN);
  const plan: UpscalePlan = {
    device,
    height: source.height,
    scale,
    tiles: tiles.map((tile) => tile.core),
    transparent,
    width: source.width,
  };
  post({ id, plan, type: "start" });

  for (const [index, tile] of tiles.entries()) {
    if (cancelled.has(id)) {
      post({ id, type: "cancelled" });
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: tiles run one after another by design; the session can't run them in parallel
    const { reconstruction } = await run(model, tileInput(source, tile), [
      1,
      CHANNELS,
      tile.paddedHeight,
      tile.paddedWidth,
    ]);
    const pixels = tileOutput(
      reconstruction.data as Float32Array,
      tile,
      scale,
      source,
      transparent
    );
    reconstruction.dispose();
    post({ id, index, pixels, type: "tile" }, [pixels.buffer]);
  }
  post({ id, type: "done" });
}

// Jobs run one at a time: the session can't run two inferences at once, and
// a new job can arrive while a cancelled one is finishing its last tile.
let queue: Promise<void> = Promise.resolve();

scope.addEventListener("message", (event: MessageEvent<UpscaleRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.id);
    return;
  }
  queue = queue.then(async () => {
    try {
      await upscale(request.id, request.image, request.model);
    } catch (cause) {
      scope.postMessage({
        id: request.id,
        message: cause instanceof Error ? cause.message : "Upscaling failed.",
        type: "error",
      } satisfies WorkerMessage);
    } finally {
      cancelled.delete(request.id);
    }
  });
});
