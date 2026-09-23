// Image upscaling with Swin2SR, run in the browser by transformers.js inside a
// Web Worker (see upscale.worker.ts). The image is processed in tiles (see
// upscale-tiles.ts) that stream back as they finish, so the result can be
// painted progressively. This file holds the model list, the message protocol
// both sides share and the main-thread entry point.

import type { Rect } from "@/lib/upscale-tiles";

export type Device = "webgpu" | "wasm";

export interface UpscaleModel {
  description: string;
  /** Size of the 4-bit weights, which is all that's downloaded. */
  downloadBytes: number;
  id: string;
  key: string;
  name: string;
  scale: 2 | 4;
}

// All run the 4-bit weights: under half the download of fp32, and in testing
// the output is within about one level per channel of fp32 (47–57 dB PSNR).
// The fp16 exports fail on the CPU backend, so they aren't used.
export const MODELS = [
  {
    description: "Real photos. Also cleans up noise and blur.",
    downloadBytes: 23_047_336,
    id: "Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
    key: "photo-4",
    name: "Photo",
    scale: 4,
  },
  {
    description: "Clean images, renders and artwork. Keeps fine texture.",
    downloadBytes: 23_784_608,
    id: "Xenova/swin2SR-classical-sr-x4-64",
    key: "detail-4",
    name: "Detail",
    scale: 4,
  },
  {
    description: "Heavily compressed images. Smooths out blocky artefacts.",
    downloadBytes: 23_791_680,
    id: "Xenova/swin2SR-compressed-sr-x4-48",
    key: "jpeg-4",
    name: "JPEG rescue",
    scale: 4,
  },
  {
    description: "Clean images, renders and artwork. Keeps fine texture.",
    downloadBytes: 23_192_795,
    id: "Xenova/swin2SR-classical-sr-x2-64",
    key: "detail-2",
    name: "Detail",
    scale: 2,
  },
  {
    description: "About four times faster, with slightly softer edges.",
    downloadBytes: 5_675_089,
    id: "Xenova/swin2SR-lightweight-x2-64",
    key: "quick-2",
    name: "Quick",
    scale: 2,
  },
] as const satisfies readonly UpscaleModel[];

export type ModelKey = (typeof MODELS)[number]["key"];

export const MODEL_FILE = "onnx/model_q4.onnx";

// Safari won't allocate a canvas over 4096² pixels, and every browser caps a
// side at 16384. Past this the result couldn't be shown or saved.
export const MAX_OUTPUT_PIXELS = 4096 * 4096;
export const MAX_OUTPUT_SIDE = 16_384;

export function findModel(key: ModelKey): UpscaleModel {
  const model = MODELS.find((candidate) => candidate.key === key);
  if (!model) {
    throw new Error(`Unknown model: ${key}`);
  }
  return model;
}

// Where transformers.js keeps downloaded files in the browser.
const CACHE_NAME = "transformers-cache";

/** Whether the model's weights are already in the browser cache. */
export async function isModelCached(model: UpscaleModel): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const url = `https://huggingface.co/${model.id}/resolve/main/${MODEL_FILE}`;
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

export interface UpscalePlan {
  device: Device;
  height: number;
  scale: number;
  /** Tile regions in source pixels, in the order they'll arrive. */
  tiles: Rect[];
  /** Whether the source has any transparent pixels (kept in the output). */
  transparent: boolean;
  width: number;
}

export type UpscaleRequest =
  | { id: number; image: Blob; model: ModelKey; type: "upscale" }
  | { id: number; type: "cancel" };

export type WorkerMessage =
  | { id: number; loaded: number; total: number; type: "download" }
  | { id: number; plan: UpscalePlan; type: "start" }
  | {
      id: number;
      index: number;
      pixels: Uint8ClampedArray<ArrayBuffer>;
      type: "tile";
    }
  | { id: number; type: "done" }
  | { id: number; type: "cancelled" }
  | { id: number; message: string; type: "error" };

export interface UpscaleHandlers {
  /** Model download progress, in bytes. Not called once it's cached. */
  onDownload: (loaded: number, total: number) => void;
  /** The model is ready and tiling is about to begin. */
  onStart: (plan: UpscalePlan) => void;
  /** One finished tile, already scaled up, for `plan.tiles[index]`. */
  onTile: (index: number, pixels: ImageData) => void;
}

let worker: Worker | null = null;
let nextId = 0;

// One worker for the page's lifetime, so the model stays loaded between runs.
function getWorker() {
  worker ??= new Worker(new URL("./upscale.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Upscales an image, streaming each finished tile to `handlers.onTile`.
 * Aborting the signal stops after the tile in progress and rejects with an
 * `AbortError`.
 */
export function upscale(
  image: Blob,
  model: ModelKey,
  handlers: UpscaleHandlers,
  signal?: AbortSignal
): Promise<void> {
  const target = getWorker();
  const id = nextId;
  nextId += 1;
  let plan: UpscalePlan | null = null;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener("message", listener);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      target.postMessage({ id, type: "cancel" } satisfies UpscaleRequest);
    };

    const listener = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) {
        return;
      }
      switch (message.type) {
        case "download":
          handlers.onDownload(message.loaded, message.total);
          return;
        case "start":
          ({ plan } = message);
          handlers.onStart(message.plan);
          return;
        case "tile": {
          if (!plan) {
            return;
          }
          const tile = plan.tiles[message.index];
          handlers.onTile(
            message.index,
            new ImageData(
              message.pixels,
              tile.width * plan.scale,
              tile.height * plan.scale
            )
          );
          return;
        }
        case "done":
          cleanup();
          resolve();
          return;
        case "cancelled":
          cleanup();
          reject(new DOMException("Upscaling was cancelled.", "AbortError"));
          return;
        default:
          cleanup();
          reject(new Error(message.message));
      }
    };

    if (signal?.aborted) {
      reject(new DOMException("Upscaling was cancelled.", "AbortError"));
      return;
    }
    target.addEventListener("message", listener);
    signal?.addEventListener("abort", onAbort);
    target.postMessage({
      id,
      image,
      model,
      type: "upscale",
    } satisfies UpscaleRequest);
  });
}
