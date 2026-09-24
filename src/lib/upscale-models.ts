// The Swin2SR models the upscaler offers. Shared by the page and
// upscale.worker.ts, so it must not import anything that spawns the worker.

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
