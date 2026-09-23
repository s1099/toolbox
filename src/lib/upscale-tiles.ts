// Tiling for Swin2SR. The model's memory use grows with the number of input
// pixels, so a whole photo at once runs out of memory in the browser. Instead
// the image is cut into tiles, each run with a margin of surrounding context
// that is cropped away afterwards, so the seams between tiles don't show.
// Pure functions only, so the worker and tests can share them.

/** Swin2SR attends within 8×8 windows; inputs must be a multiple of this. */
export const WINDOW = 8;

const CHANNELS_IN = 3;
const RGBA = 4;
const MAX_BYTE = 255;
const OPAQUE = 255;
const HALF_PIXEL = 0.5;

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface TilePlan {
  /** The part of the source this tile is responsible for. */
  core: Rect;
  /** The core plus its context margin, clamped to the image. */
  input: Rect;
  /** Input height rounded up to a multiple of {@link WINDOW}. */
  paddedHeight: number;
  /** Input width rounded up to a multiple of {@link WINDOW}. */
  paddedWidth: number;
}

/** Decoded RGBA pixels, as `ImageData` or transformers.js `RawImage` hold them. */
export interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  height: number;
  width: number;
}

const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;

// Splits `length` into `count` nearly equal spans, so the last tile is never a
// thin sliver.
function spans(length: number, count: number): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.round((i * length) / count);
    const end = Math.round(((i + 1) * length) / count);
    result.push([start, end - start]);
  }
  return result;
}

/**
 * Plans tiles of at most `tileSize` source pixels a side, each with `margin`
 * pixels of context on every side that stays inside the image. Tiles are in
 * reading order, so the result fills in top to bottom.
 */
export function planTiles(
  width: number,
  height: number,
  tileSize: number,
  margin: number
): TilePlan[] {
  const columns = spans(width, Math.ceil(width / tileSize));
  const rows = spans(height, Math.ceil(height / tileSize));
  const tiles: TilePlan[] = [];

  for (const [y, coreHeight] of rows) {
    for (const [x, coreWidth] of columns) {
      const left = Math.max(0, x - margin);
      const top = Math.max(0, y - margin);
      const right = Math.min(width, x + coreWidth + margin);
      const bottom = Math.min(height, y + coreHeight + margin);
      const input = {
        height: bottom - top,
        width: right - left,
        x: left,
        y: top,
      };
      tiles.push({
        core: { height: coreHeight, width: coreWidth, x, y },
        input,
        paddedHeight: roundUp(input.height, WINDOW),
        paddedWidth: roundUp(input.width, WINDOW),
      });
    }
  }
  return tiles;
}

// Mirrors an index that runs past the end back into [0, length), repeating the
// edge pixel ("symmetric" padding, as the Swin2SR processor does).
function mirror(index: number, length: number) {
  const period = length * 2;
  const wrapped = index % period;
  return wrapped < length ? wrapped : period - 1 - wrapped;
}

/**
 * The tile's input as the model expects it: planar RGB in 0–1, padded
 * symmetrically on the right and bottom up to a multiple of {@link WINDOW}.
 */
export function tileInput(source: Pixels, tile: TilePlan): Float32Array {
  const { input, paddedHeight, paddedWidth } = tile;
  const plane = paddedWidth * paddedHeight;
  const values = new Float32Array(plane * CHANNELS_IN);

  for (let row = 0; row < paddedHeight; row += 1) {
    const sourceY = input.y + mirror(row, input.height);
    for (let column = 0; column < paddedWidth; column += 1) {
      const sourceX = input.x + mirror(column, input.width);
      const from = (sourceY * source.width + sourceX) * RGBA;
      const to = row * paddedWidth + column;
      values[to] = source.data[from] / MAX_BYTE;
      values[plane + to] = source.data[from + 1] / MAX_BYTE;
      values[plane * 2 + to] = source.data[from + 2] / MAX_BYTE;
    }
  }
  return values;
}

/** True when any pixel is less than fully opaque. */
export function hasTransparency(source: Pixels) {
  for (let i = RGBA - 1; i < source.data.length; i += RGBA) {
    if (source.data[i] !== OPAQUE) {
      return true;
    }
  }
  return false;
}

// Bilinear sample of the alpha channel at a fractional source position.
function sampleAlpha(source: Pixels, x: number, y: number) {
  const clampedX = Math.min(Math.max(x, 0), source.width - 1);
  const clampedY = Math.min(Math.max(y, 0), source.height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, source.width - 1);
  const y1 = Math.min(y0 + 1, source.height - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const at = (px: number, py: number) =>
    source.data[(py * source.width + px) * RGBA + RGBA - 1];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Crops the model's output for one tile down to its core and converts it to
 * RGBA bytes. The model only sees RGB, so alpha (when the source has any) is
 * scaled up bilinearly instead.
 */
export function tileOutput(
  reconstruction: Float32Array,
  tile: TilePlan,
  scale: number,
  source: Pixels,
  keepAlpha: boolean
): Uint8ClampedArray<ArrayBuffer> {
  const { core, input, paddedHeight, paddedWidth } = tile;
  const outWidth = paddedWidth * scale;
  const plane = outWidth * paddedHeight * scale;
  const width = core.width * scale;
  const height = core.height * scale;
  const offsetX = (core.x - input.x) * scale;
  const offsetY = (core.y - input.y) * scale;
  const pixels = new Uint8ClampedArray(width * height * RGBA);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = (offsetY + row) * outWidth + offsetX + column;
      const to = (row * width + column) * RGBA;
      // Uint8ClampedArray clamps and rounds for us.
      pixels[to] = reconstruction[from] * MAX_BYTE;
      pixels[to + 1] = reconstruction[plane + from] * MAX_BYTE;
      pixels[to + 2] = reconstruction[plane * 2 + from] * MAX_BYTE;
      pixels[to + 3] = keepAlpha
        ? sampleAlpha(
            source,
            core.x + (column + HALF_PIXEL) / scale - HALF_PIXEL,
            core.y + (row + HALF_PIXEL) / scale - HALF_PIXEL
          )
        : OPAQUE;
    }
  }
  return pixels;
}
