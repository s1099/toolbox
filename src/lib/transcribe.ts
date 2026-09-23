// Whisper speech-to-text, run in the browser by transformers.js inside a Web
// Worker (see transcribe.worker.ts). This file holds what both sides share —
// the model list, the worker message protocol — plus the main-thread helpers
// for decoding audio and exporting a transcript.

export type Device = "webgpu" | "wasm";

// The file each ONNX session loads, by dtype suffix. WebGPU keeps the encoder
// at full precision and runs a 4-bit decoder, the setup transformers.js' own
// WebGPU Whisper demo uses; WASM runs both 8-bit, the library's default there.
export const DTYPES = {
  wasm: { decoder_model_merged: "q8", encoder_model: "q8" },
  webgpu: { decoder_model_merged: "q4", encoder_model: "fp32" },
} as const;

// Download sizes in bytes for each device's DTYPES, summed from the Hugging
// Face file listings: encoder + merged decoder + config, generation config,
// preprocessor config, tokenizer and tokenizer config.
export const MODELS = [
  {
    bytes: { wasm: 43_613_734, webgpu: 122_388_197 },
    id: "onnx-community/whisper-tiny",
    label: "Whisper Tiny",
  },
  {
    bytes: { wasm: 79_664_191, webgpu: 208_840_059 },
    id: "onnx-community/whisper-base",
    label: "Whisper Base",
  },
  {
    bytes: { wasm: 251_846_613, webgpu: 588_744_805 },
    id: "onnx-community/whisper-small",
    label: "Whisper Small",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export interface Segment {
  end: number;
  start: number;
  text: string;
}

export interface Transcript {
  /** Whisper language code, detected when none was chosen. */
  language: string;
  segments: Segment[];
  text: string;
}

export interface TranscribeRequest {
  audio: Float32Array;
  device: Device;
  /** Whisper language code, or null to let the model detect it. */
  language: string | null;
  model: ModelId;
}

export type WorkerMessage =
  | { type: "device"; device: Device }
  | { type: "download"; loaded: number; total: number }
  | { type: "transcribing" }
  | { type: "partial"; text: string }
  | { type: "done"; transcript: Transcript }
  | { type: "error"; message: string };

/** Whisper's feature extractor expects 16 kHz mono. */
export const SAMPLE_RATE = 16_000;

/**
 * Decodes any format the browser can play (including the audio track of most
 * video files) and resamples it to 16 kHz mono.
 */
export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0);
    }
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) {
        mono[i] += data[i] / buffer.numberOfChannels;
      }
    }
    return mono;
  } finally {
    await context.close();
  }
}

export async function detectDevice(): Promise<Device> {
  if (!("gpu" in navigator)) {
    return "wasm";
  }
  try {
    const adapter = await (
      navigator as Navigator & {
        gpu: { requestAdapter: () => Promise<unknown> };
      }
    ).gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

const BYTES_PER_MB = 1_000_000;
const BYTES_PER_GB = 1_000_000_000;

export function formatBytes(bytes: number) {
  return bytes >= BYTES_PER_GB
    ? `${(bytes / BYTES_PER_GB).toFixed(1)} GB`
    : `${Math.round(bytes / BYTES_PER_MB)} MB`;
}

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

const pad = (value: number, length = 2) =>
  value.toString().padStart(length, "0");

/** `1:05` or `1:02:05`, for display. */
export function formatClock(seconds: number) {
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = Math.floor(seconds % SECONDS_PER_MINUTE);
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

/** `00:01:05,250` (SRT) or `00:01:05.250` (VTT). */
function formatCueTime(seconds: number, separator: "," | ".") {
  const totalMs = Math.round(seconds * MS_PER_SECOND);
  const ms = totalMs % MS_PER_SECOND;
  const totalSeconds = Math.floor(totalMs / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const rest = totalSeconds % SECONDS_PER_MINUTE;
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}${separator}${pad(ms, 3)}`;
}

export interface CharacterAlignment {
  characterEndTimesSeconds: number[];
  characterStartTimesSeconds: number[];
  characters: string[];
}

/**
 * Per-character timings for the transcript viewer. These Whisper exports don't
 * output cross-attentions, so there are no word-level timestamps; instead each
 * segment's span is spread evenly over its characters. Highlighting drifts a
 * little inside a segment and lines up again at every segment boundary.
 */
export function toAlignment(segments: Segment[]): CharacterAlignment {
  const alignment: CharacterAlignment = {
    characterEndTimesSeconds: [],
    characterStartTimesSeconds: [],
    characters: [],
  };

  for (const [index, segment] of segments.entries()) {
    if (index > 0) {
      alignment.characters.push(" ");
      alignment.characterStartTimesSeconds.push(segment.start);
      alignment.characterEndTimesSeconds.push(segment.start);
    }
    const characters = [...segment.text];
    const step = (segment.end - segment.start) / characters.length;
    for (const [offset, character] of characters.entries()) {
      alignment.characters.push(character);
      alignment.characterStartTimesSeconds.push(segment.start + offset * step);
      alignment.characterEndTimesSeconds.push(
        segment.start + (offset + 1) * step
      );
    }
  }
  return alignment;
}

export type ExportFormat = "txt" | "srt" | "vtt";

export function formatTranscript(
  transcript: Transcript,
  format: ExportFormat
): string {
  if (format === "txt") {
    return `${transcript.text}\n`;
  }

  const separator = format === "srt" ? "," : ".";
  const cues = transcript.segments.map((segment, index) => {
    const time = `${formatCueTime(segment.start, separator)} --> ${formatCueTime(segment.end, separator)}`;
    return format === "srt"
      ? `${index + 1}\n${time}\n${segment.text}`
      : `${time}\n${segment.text}`;
  });
  const body = cues.join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
