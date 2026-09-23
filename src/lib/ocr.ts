// PP-OCRv6 (small) text detection + recognition, run in the browser with
// onnxruntime-web inside a Web Worker (see ocr.worker.ts). This file holds the
// message protocol both sides share and the main-thread entry point.

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface OcrLine {
  box: Box;
  score: number;
  text: string;
}

export interface OcrResult {
  lines: OcrLine[];
  text: string;
}

/** Combined across every file the engine downloads. */
export interface LoadProgress {
  loaded: number;
  total: number;
}

export interface OcrRequest {
  id: number;
  image: ImageBitmap;
}

export type WorkerMessage =
  | { id: number; type: "progress"; progress: LoadProgress }
  | { id: number; type: "done"; result: OcrResult }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 0;

// One worker for the page's lifetime, so the models stay loaded between images.
function getWorker() {
  worker ??= new Worker(new URL("./ocr.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Reads the text in `image`. The bitmap is transferred to the worker, which
 * closes it when done, so it is unusable here once this is called.
 */
export function runOcr(
  image: ImageBitmap,
  onProgress?: (progress: LoadProgress) => void
): Promise<OcrResult> {
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
        onProgress?.(message.progress);
        return;
      }
      target.removeEventListener("message", listener);
      if (message.type === "done") {
        resolve(message.result);
      } else {
        reject(new Error(message.message));
      }
    };
    target.addEventListener("message", listener);
    target.postMessage({ id, image } satisfies OcrRequest, [image]);
  });
}
