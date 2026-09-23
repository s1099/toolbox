import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
  Tensor,
  WhisperTextStreamer,
} from "@huggingface/transformers";
import {
  type Device,
  DTYPES,
  type ModelId,
  SAMPLE_RATE,
  type Segment,
  type TranscribeRequest,
  type WorkerMessage,
} from "@/lib/transcribe";

// Models only ever come from the Hub; skip probing this site for local copies.
env.allowLocalModels = false;

// Whisper sees 30 s windows; longer audio is split with overlap and stitched
// back together by the pipeline.
const CHUNK_LENGTH_S = 30;
const STRIDE_LENGTH_S = 5;

// The DOM lib types `postMessage` as Window's; in a worker it's this.
const scope = self as unknown as Worker;
const send = (message: WorkerMessage) => scope.postMessage(message);

let loaded: {
  device: Device;
  model: ModelId;
  transcriber: AutomaticSpeechRecognitionPipeline;
} | null = null;

async function load(model: ModelId, device: Device) {
  if (loaded?.model === model && loaded.device === device) {
    return loaded.transcriber;
  }
  // One model in memory at a time — whisper-small alone is ~600 MB on WebGPU.
  await loaded?.transcriber.dispose();
  loaded = null;

  const transcriber = (await pipeline("automatic-speech-recognition", model, {
    device,
    dtype: DTYPES[device],
    progress_callback: (info) => {
      if (info.status === "progress_total") {
        send({ loaded: info.loaded, total: info.total, type: "download" });
      }
    },
  })) as AutomaticSpeechRecognitionPipeline;
  loaded = { device, model, transcriber };
  return transcriber;
}

async function loadWithFallback(model: ModelId, device: Device) {
  if (device === "wasm") {
    return await load(model, "wasm");
  }
  try {
    return await load(model, "webgpu");
  } catch {
    // Adapter present but the session failed (driver, limits, missing ops).
    send({ device: "wasm", type: "device" });
    return await load(model, "wasm");
  }
}

interface WhisperGenerationConfig {
  decoder_start_token_id: number;
  lang_to_id: Record<string, number>;
}

const LANGUAGE_TOKEN = /^<\|(.+)\|>$/;

/**
 * transformers.js doesn't implement Whisper's language detection yet (it falls
 * back to English), so this is the reference approach: decode one step from
 * <|startoftranscript|> over the first 30 s window and take the most likely
 * language token.
 */
async function detectLanguage(
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array
): Promise<string> {
  const { input_features } = await transcriber.processor(
    audio.subarray(0, CHUNK_LENGTH_S * SAMPLE_RATE)
  );
  const config = transcriber.model
    .generation_config as unknown as WhisperGenerationConfig;
  const decoder_input_ids = new Tensor(
    "int64",
    BigInt64Array.from([BigInt(config.decoder_start_token_id)]),
    [1, 1]
  );
  const { logits } = await transcriber.model({
    decoder_input_ids,
    input_features,
  });
  const scores = logits.data as Float32Array;

  let best = "<|en|>";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [token, id] of Object.entries(config.lang_to_id)) {
    if (scores[id] > bestScore) {
      best = token;
      bestScore = scores[id];
    }
  }
  return LANGUAGE_TOKEN.exec(best)?.[1] ?? "en";
}

async function transcribe({
  audio,
  device,
  language,
  model,
}: TranscribeRequest) {
  const transcriber = await loadWithFallback(model, device);
  send({ type: "transcribing" });
  const resolvedLanguage =
    language ?? (await detectLanguage(transcriber, audio));

  let partial = "";
  const streamer = new WhisperTextStreamer(
    // A Whisper pipeline always carries a WhisperTokenizer; the pipeline type
    // just doesn't say so.
    transcriber.tokenizer as ConstructorParameters<
      typeof WhisperTextStreamer
    >[0],
    {
      callback_function: (text) => {
        partial += text;
        send({ text: partial, type: "partial" });
      },
      skip_prompt: true,
    }
  );

  const output = await transcriber(audio, {
    chunk_length_s: CHUNK_LENGTH_S,
    language: resolvedLanguage,
    return_timestamps: true,
    streamer,
    stride_length_s: STRIDE_LENGTH_S,
    task: "transcribe",
  });

  const duration = audio.length / SAMPLE_RATE;
  const segments: Segment[] = (output.chunks ?? [])
    .map(({ text, timestamp: [start, end] }) => ({
      // The final chunk's end is null when the audio stops mid-sentence.
      end: end ?? duration,
      start,
      text: text.trim(),
    }))
    .filter((segment) => segment.text.length > 0);

  send({
    transcript: {
      language: resolvedLanguage,
      segments,
      text: output.text.trim(),
    },
    type: "done",
  });
}

scope.addEventListener("message", async (event: MessageEvent) => {
  try {
    await transcribe(event.data as TranscribeRequest);
  } catch (cause) {
    send({
      message: cause instanceof Error ? cause.message : "Transcription failed.",
      type: "error",
    });
  }
});
