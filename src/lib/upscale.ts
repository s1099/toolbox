// Image upscaling with Swin2SR, run in the browser by transformers.js inside a
// Web Worker (see upscale.worker.ts). The image is processed in tiles (see
// upscale-tiles.ts) that stream back as they finish, so the result can be
// painted progressively. The model list is in upscale-models.ts. This file
// holds the message protocol both sides share and the main-thread entry point.
//
// The worker may only `import type` from this file: a value import would pull
// the `new Worker(new URL(...))` below into the worker's own bundle, and that
// self-reference hangs `next build` forever under Turbopack.

import type { ModelKey } from "@/lib/upscale-models";
import type { Rect } from "@/lib/upscale-tiles";

export type Device = "webgpu" | "wasm";

// Safari won't allocate a canvas over 4096² pixels, and every browser caps a
// side at 16384. Past this the result couldn't be shown or saved.
export const MAX_OUTPUT_PIXELS = 4096 * 4096;
export const MAX_OUTPUT_SIDE = 16_384;

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
