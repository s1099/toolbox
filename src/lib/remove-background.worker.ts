import {
  AutoModel,
  AutoProcessor,
  env,
  type PreTrainedModel,
  type Processor,
  RawImage,
  type Tensor,
} from "@huggingface/transformers";
import {
  type Device,
  MODEL_ID,
  type Progress,
  type RemoveRequest,
  type WorkerMessage,
} from "@/lib/remove-background";

// Models only ever come from the Hub; skip probing this site for local copies.
env.allowLocalModels = false;

// The DOM lib types `postMessage` as Window's; in a worker it's this.
const scope = self as unknown as Worker;

const OPAQUE = 255;
const RGBA = 4;

interface Loaded {
  model: PreTrainedModel;
  processor: Processor;
}

let loading: Promise<Loaded> | null = null;

interface GpuAdapter {
  features: { has: (feature: string) => boolean };
}

type Dtype = "fp32" | "fp16" | "q8";

// Download sizes: fp32 176 MB, fp16 88 MB, q8 44 MB. WebGPU runs fp16 where
// the adapter supports f16 shaders and fp32 otherwise; WASM gets the 8-bit
// model, which is a quarter of the download with near-identical mattes.
async function pickDtype(): Promise<{ device: Device; dtype: Dtype }> {
  const { gpu } = navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<GpuAdapter | null> };
  };
  try {
    const adapter = await gpu?.requestAdapter();
    if (adapter) {
      return {
        device: "webgpu",
        dtype: adapter.features.has("shader-f16") ? "fp16" : "fp32",
      };
    }
  } catch {
    // Fall through to WASM.
  }
  return { device: "wasm", dtype: "q8" };
}

async function load(
  device: Device,
  dtype: Dtype,
  onProgress: (progress: Progress) => void
): Promise<Loaded> {
  const [model, processor] = await Promise.all([
    AutoModel.from_pretrained(MODEL_ID, {
      device,
      dtype,
      progress_callback: (info) => {
        if (info.status === "progress_total") {
          onProgress({
            loaded: info.loaded,
            phase: "download",
            total: info.total,
          });
        }
      },
    }),
    AutoProcessor.from_pretrained(MODEL_ID),
  ]);
  return { model, processor };
}

async function loadWithFallback(
  onProgress: (progress: Progress) => void
): Promise<Loaded> {
  const { device, dtype } = await pickDtype();
  if (device === "wasm") {
    return await load("wasm", "q8", onProgress);
  }
  try {
    return await load("webgpu", dtype, onProgress);
  } catch {
    // Adapter present but the session failed (driver, limits, missing ops).
    return await load("wasm", "q8", onProgress);
  }
}

// Every request shares one load; a failed load is forgotten so the next
// request can try again.
function getModel(onProgress: (progress: Progress) => void) {
  loading ??= loadWithFallback(onProgress).catch((cause: unknown) => {
    loading = null;
    throw cause;
  });
  return loading;
}

async function removeBackground({ id, image }: RemoveRequest) {
  const onProgress = (progress: Progress) =>
    scope.postMessage({
      id,
      progress,
      type: "progress",
    } satisfies WorkerMessage);

  const [{ model, processor }, original] = await Promise.all([
    getModel(onProgress),
    RawImage.fromBlob(image),
  ]);
  onProgress({ phase: "processing" });

  const { pixel_values } = await processor(original.rgb());
  const { output } = (await model({ input: pixel_values })) as {
    output: Tensor;
  };

  // The model predicts a 1024×1024 matte in 0–1; scale it back to the photo
  // and use it as the alpha channel.
  const matte = RawImage.fromTensor(output.squeeze(0).mul(OPAQUE).to("uint8"));
  const mask = await matte.resize(original.width, original.height);

  const pixels = original.rgba();
  for (let i = 0; i < mask.data.length; i += 1) {
    pixels.data[i * RGBA + RGBA - 1] = mask.data[i];
  }

  scope.postMessage({
    id,
    image: await pixels.toBlob("image/png"),
    type: "done",
  } satisfies WorkerMessage);
}

scope.addEventListener("message", async (event: MessageEvent) => {
  const request = event.data as RemoveRequest;
  try {
    await removeBackground(request);
  } catch (cause) {
    scope.postMessage({
      id: request.id,
      message:
        cause instanceof Error ? cause.message : "Background removal failed.",
      type: "error",
    } satisfies WorkerMessage);
  }
});
