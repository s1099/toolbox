// Background removal with BRIA RMBG-1.4, run in the browser by transformers.js
// inside a Web Worker (see remove-background.worker.ts). This file holds the
// message protocol both sides share and the main-thread entry point.
//
// The worker may only `import type` from this file: a value import would pull
// the `new Worker(new URL(...))` below into the worker's own bundle, and that
// self-reference hangs `next build` forever under Turbopack.

export type Device = "webgpu" | "wasm";

export type Progress =
  | { phase: "download"; loaded: number; total: number }
  | { phase: "processing" };

export interface RemoveRequest {
  id: number;
  image: Blob;
}

export type WorkerMessage =
  | { id: number; type: "progress"; progress: Progress }
  | { id: number; type: "done"; image: Blob }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 0;

// One worker for the page's lifetime, so the model stays loaded between images.
function getWorker() {
  worker ??= new Worker(
    new URL("./remove-background.worker.ts", import.meta.url),
    { type: "module" }
  );
  return worker;
}

/** Returns the image as a PNG with its background made transparent. */
export function removeBackground(
  image: Blob,
  onProgress: (progress: Progress) => void
): Promise<Blob> {
  const target = getWorker();
  const id = nextId;
  nextId += 1;

  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) {
        return;
      }
      if (message.type === "progress") {
        onProgress(message.progress);
        return;
      }
      target.removeEventListener("message", listener);
      if (message.type === "done") {
        resolve(message.image);
      } else {
        reject(new Error(message.message));
      }
    };
    target.addEventListener("message", listener);
    target.postMessage({ id, image } satisfies RemoveRequest);
  });
}
