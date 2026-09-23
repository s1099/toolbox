"use client";

import {
  AiChipIcon,
  Alert02Icon,
  Cancel01Icon,
  Copy01Icon,
  Download04Icon,
  FileAudioIcon,
  Globe02Icon,
  InformationCircleIcon,
  SubtitleIcon,
  TextAlignLeftIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  type ComponentProps,
  type DragEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { MicSelector } from "@/components/ui/mic-selector";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TranscriptViewerAudio,
  TranscriptViewerContainer,
  TranscriptViewerPlayPauseButton,
  TranscriptViewerScrubBar,
  TranscriptViewerWord,
  TranscriptViewerWords,
  useTranscriptViewerContext,
} from "@/components/ui/transcript-viewer";
import { VoiceButton } from "@/components/ui/voice-button";
import {
  type CharacterAlignment,
  type Device,
  decodeAudio,
  detectDevice,
  type ExportFormat,
  formatBytes,
  formatClock,
  formatTranscript,
  MODELS,
  type ModelId,
  SAMPLE_RATE,
  type Transcript,
  toAlignment,
  type WorkerMessage,
} from "@/lib/transcribe";

const DEFAULT_MODEL: ModelId = "onnx-community/whisper-tiny";

const MODEL_LABELS = Object.fromEntries(
  MODELS.map((model) => [model.id, model.label])
) as Record<ModelId, string>;

// Keys are Whisper language codes.
const LANGUAGES = {
  auto: "Auto-detect",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  ja: "Japanese",
} as const;

type Language = keyof typeof LANGUAGES;

// Names for whatever language Whisper detects, not just the ones listed above.
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

const EXPORT_FORMATS: ExportFormat[] = ["txt", "srt", "vtt"];

const PERCENT = 100;
const COPIED_RESET_MS = 1500;
const TIMER_INTERVAL_MS = 250;
const MS_PER_SECOND = 1000;

// Space shouldn't toggle recording when it's already activating a control.
const INTERACTIVE =
  "button, a, input, textarea, select, [role=switch], [role=tab], [role=menuitem], [contenteditable=true]";

interface Source {
  audio: Float32Array;
  duration: number;
  name: string;
  type: string;
  url: string;
}

type AudioType = ComponentProps<typeof TranscriptViewerContainer>["audioType"];

type Status =
  | { phase: "idle" }
  | { phase: "loading"; percent: number | null }
  | { phase: "transcribing"; partial: string }
  | { phase: "done"; transcript: Transcript; alignment: CharacterAlignment }
  | { phase: "error"; message: string };

export default function TranscriptPage() {
  const [tab, setTab] = useState<"upload" | "record">("upload");
  const [source, setSource] = useState<Source | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordStart, setRecordStart] = useState(0);
  const [now, setNow] = useState(0);
  const [micId, setMicId] = useState<string>();
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [language, setLanguage] = useState<Language>("auto");
  const [device, setDevice] = useState<Device>("wasm");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status.phase === "loading" || status.phase === "transcribing";

  const onWorkerMessage = useEffectEvent((message: WorkerMessage) => {
    switch (message.type) {
      case "device":
        setDevice(message.device);
        break;
      case "download":
        setStatus({
          percent:
            message.total > 0
              ? Math.floor((message.loaded / message.total) * PERCENT)
              : null,
          phase: "loading",
        });
        break;
      case "transcribing":
        setStatus({ partial: "", phase: "transcribing" });
        break;
      case "partial":
        setStatus({ partial: message.text, phase: "transcribing" });
        break;
      case "done":
        setStatus({
          alignment: toAlignment(message.transcript.segments),
          phase: "done",
          transcript: message.transcript,
        });
        break;
      case "error":
        setStatus({ message: message.message, phase: "error" });
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../lib/transcribe.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) =>
      onWorkerMessage(event.data)
    );
    workerRef.current = worker;
    detectDevice().then(setDevice);
    return () => worker.terminate();
  }, []);

  const sourceUrl = source?.url;
  useEffect(
    () => () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    },
    [sourceUrl]
  );

  useEffect(() => {
    if (!recording) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), TIMER_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [recording]);

  // Stop the mic if the page unmounts mid-recording.
  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    },
    []
  );

  const loadSource = async (blob: Blob, name: string) => {
    setStatus({ phase: "idle" });
    try {
      const audio = await decodeAudio(blob);
      setSource({
        audio,
        duration: audio.length / SAMPLE_RATE,
        name,
        type: blob.type,
        url: URL.createObjectURL(blob),
      });
    } catch {
      setSource(null);
      setStatus({
        message: "Couldn't read audio from that file.",
        phase: "error",
      });
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const isMedia =
      file.type.startsWith("audio/") || file.type.startsWith("video/");
    if (!isMedia) {
      setStatus({ message: "That file isn't audio or video.", phase: "error" });
      return;
    }
    loadSource(file, file.name);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files[0]);
  };

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
    } catch {
      setStatus({ message: "Microphone access was denied.", phase: "error" });
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener("stop", () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      const blob = new Blob(chunks, { type: recorder.mimeType });
      loadSource(blob, `Recording ${new Date().toLocaleTimeString()}`);
    });
    recorder.start();
    recorderRef.current = recorder;

    const startedAt = Date.now();
    setRecordStart(startedAt);
    setNow(startedAt);
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else if (!busy) {
      startRecording();
    }
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const ignore =
      tab !== "record" ||
      event.code !== "Space" ||
      event.repeat ||
      target?.closest(INTERACTIVE);
    if (ignore) {
      return;
    }
    event.preventDefault();
    toggleRecording();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const transcribe = () => {
    if (!source) {
      return;
    }
    // Transfer a copy so the source stays usable for another run.
    const audio = source.audio.slice();
    setStatus({ percent: null, phase: "loading" });
    workerRef.current?.postMessage(
      {
        audio,
        device,
        language: language === "auto" ? null : language,
        model,
      },
      [audio.buffer]
    );
  };

  const elapsed = recording ? (now - recordStart) / MS_PER_SECOND : 0;

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2 md:overflow-hidden">
      <Tabs
        className="flex flex-col gap-3 md:min-h-0 md:overflow-y-auto"
        onValueChange={(value) => setTab(value as "upload" | "record")}
        value={tab}
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-heading font-semibold text-lg">Transcript</h1>
          <TabsList>
            <TabsTrigger disabled={recording} value="upload">
              Upload
            </TabsTrigger>
            <TabsTrigger value="record">Record</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          className="flex min-h-56 flex-1 rounded-xl border border-dashed bg-muted/30 shadow-well data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5"
          data-dragging={dragging}
          value="upload"
        >
          <input
            accept="audio/*,video/*"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
          {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target, the button inside is the keyboard path */}
          {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop target, the button inside is the keyboard path */}
          <div
            className="flex flex-1"
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={handleDrop}
          >
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={FileAudioIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>Drop an audio file</EmptyTitle>
                <EmptyDescription>
                  MP3, WAV, M4A, WebM or a video file.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  size="sm"
                >
                  <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />
                  Choose file
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        </TabsContent>

        <TabsContent
          className="flex min-h-56 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 shadow-well"
          value="record"
        >
          <div className="relative flex flex-1 items-center px-4">
            <LiveWaveform
              active={recording}
              barGap={2}
              barRadius={8}
              barWidth={4}
              className="w-full text-muted-foreground"
              deviceId={micId}
              fadeEdges
              fadeWidth={48}
              height={96}
            />
            {recording ? (
              <span className="absolute top-3 right-4 font-mono text-muted-foreground text-xs tabular-nums">
                {formatClock(elapsed)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2">
            <MicSelector
              disabled={recording}
              onValueChange={setMicId}
              value={micId}
            />
            <VoiceButton
              disabled={busy}
              label={recording ? "Stop" : "Record"}
              onPress={toggleRecording}
              size="sm"
              state={recording ? "recording" : "idle"}
              trailing={<Kbd>Space</Kbd>}
            />
          </div>
        </TabsContent>

        {source ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-surface">
            <HugeiconsIcon
              className="size-4 shrink-0 text-muted-foreground"
              icon={FileAudioIcon}
              strokeWidth={2}
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {source.name}
            </span>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {formatClock(source.duration)}
            </span>
            <Button
              aria-label="Remove audio"
              disabled={busy}
              onClick={() => {
                setSource(null);
                setStatus({ phase: "idle" });
              }}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-surface">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="model">Model</Label>
              <Tooltip>
                <TooltipTrigger
                  aria-label="About models"
                  className="rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <HugeiconsIcon
                    className="size-3.5"
                    icon={InformationCircleIcon}
                    strokeWidth={2}
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  Tiny is recommended, but for higher accuracy you can switch to
                  the other models.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              disabled={busy}
              items={MODEL_LABELS}
              onValueChange={(value) =>
                setModel((value as ModelId | null) ?? DEFAULT_MODEL)
              }
              value={model}
            >
              <SelectTrigger className="w-48" id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-auto min-w-(--anchor-width)">
                {MODELS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex flex-1 items-baseline justify-between gap-6">
                      {option.label}
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatBytes(option.bytes[device])}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="language">Language</Label>
            <Select
              disabled={busy}
              items={LANGUAGES}
              onValueChange={(value) =>
                setLanguage((value as Language | null) ?? "auto")
              }
              value={language}
            >
              <SelectTrigger className="w-40" id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button disabled={!source || recording || busy} onClick={transcribe}>
            Transcribe
          </Button>
        </div>
      </Tabs>

      <section className="flex flex-col gap-3 md:min-h-0">
        <TranscriptHeader
          language={language}
          model={model}
          name={source?.name}
          status={status}
        />
        <div className="flex min-h-72 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-surface">
          <TranscriptBody
            device={device}
            model={model}
            source={source}
            status={status}
          />
        </div>
      </section>
    </div>
  );
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const EXTENSION = /\.[^.]+$/;

function MetaItem({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: IconSvgElement;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt>
        <HugeiconsIcon
          aria-hidden="true"
          className="size-3.5 shrink-0"
          icon={icon}
          strokeWidth={2}
        />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="flex min-w-0 items-baseline gap-1.5 truncate">
        {children}
      </dd>
    </div>
  );
}

function TranscriptHeader({
  language,
  model,
  name,
  status,
}: {
  language: Language;
  model: ModelId;
  name: string | undefined;
  status: Status;
}) {
  const [copied, setCopied] = useState(false);
  const transcript = status.phase === "done" ? status.transcript : null;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  const baseName = (name ?? "transcript").replace(EXTENSION, "");

  return (
    <div className="flex h-8 items-center justify-between gap-2">
      {transcript ? (
        <dl className="flex min-w-0 items-center gap-4 text-muted-foreground text-sm">
          <MetaItem icon={AiChipIcon} label="Model">
            {MODEL_LABELS[model]}
          </MetaItem>
          <MetaItem icon={Globe02Icon} label="Language">
            {LANGUAGE_NAMES.of(transcript.language) ?? transcript.language}
            {language === "auto" ? (
              <span className="text-muted-foreground/70 text-xs">auto</span>
            ) : null}
          </MetaItem>
          <MetaItem icon={TextAlignLeftIcon} label="Segments">
            {transcript.segments.length}{" "}
            {transcript.segments.length === 1 ? "segment" : "segments"}
          </MetaItem>
        </dl>
      ) : (
        <span className="text-muted-foreground text-sm">Transcript text</span>
      )}
      {transcript && transcript.text.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button
            onClick={() => copy(transcript.text)}
            size="sm"
            variant="outline"
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            {copied ? "Copied" : "Copy"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" variant="outline" />}
            >
              <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format}
                  onClick={() =>
                    download(
                      formatTranscript(transcript, format),
                      `${baseName}.${format}`
                    )
                  }
                >
                  .{format}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function TranscriptBody({
  device,
  model,
  source,
  status,
}: {
  device: Device;
  model: ModelId;
  source: Source | null;
  status: Status;
}) {
  switch (status.phase) {
    case "idle":
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No transcript yet</EmptyTitle>
            <EmptyDescription>
              Upload or record audio, then press Transcribe.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );

    case "error":
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            {status.message}
          </p>
        </div>
      );

    case "loading":
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <ShimmeringText
            className="text-sm"
            text={
              status.percent === null
                ? "Loading model…"
                : `Downloading ${MODEL_LABELS[model]}… ${status.percent}%`
            }
          />
          <Progress
            className="w-full max-w-sm"
            value={status.percent ?? null}
          />
          <span className="text-muted-foreground text-xs">
            Running on {device === "webgpu" ? "WebGPU" : "CPU (WASM)"}. The
            model is cached after the first download.
          </span>
        </div>
      );

    case "transcribing":
      return status.partial ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            <ShimmeringText className="text-xs" text="Transcribing…" />
            <p className="text-sm leading-relaxed">{status.partial}</p>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <LiveWaveform
            barGap={1}
            barRadius={8}
            barWidth={3}
            className="w-full max-w-sm text-muted-foreground opacity-60"
            fadeEdges
            height={64}
            processing
          />
          <ShimmeringText className="text-sm" text="Transcribing audio…" />
        </div>
      );

    case "done":
      if (status.transcript.segments.length === 0 || !source) {
        return (
          <p className="p-4 text-muted-foreground text-sm">
            {status.transcript.text || "No speech detected."}
          </p>
        );
      }
      return (
        <TranscriptViewerContainer
          alignment={status.alignment}
          audioSrc={source.url}
          audioType={(source.type || "audio/mpeg") as AudioType}
          className="flex min-h-0 flex-1 flex-col gap-0 space-y-0 p-0"
          // A new source or run gets fresh playback state.
          key={`${source.url}-${status.alignment.characters.length}`}
        >
          <TranscriptViewerAudio className="hidden" />
          <ScrollArea className="min-h-0 flex-1">
            <TranscriptViewerWords
              className="p-4 text-base"
              renderWord={({ word, status: wordStatus }) => (
                <SeekableWord status={wordStatus} word={word} />
              )}
              sections={status.transcript.segments}
            />
          </ScrollArea>
          <div className="flex items-center gap-3 border-t px-3 py-2">
            <TranscriptViewerPlayPauseButton size="icon-sm" variant="ghost" />
            <TranscriptViewerScrubBar className="flex-1" />
          </div>
        </TranscriptViewerContainer>
      );

    default:
      return null;
  }
}

type WordProps = ComponentProps<typeof TranscriptViewerWord>;

/** Clicking a word jumps playback to it; the scrub bar is the keyboard path. */
function SeekableWord({ status, word }: Pick<WordProps, "status" | "word">) {
  const { seekToTime } = useTranscriptViewerContext();
  return (
    <button
      className="cursor-pointer"
      onClick={() => seekToTime(word.startTime)}
      tabIndex={-1}
      type="button"
    >
      <TranscriptViewerWord status={status} word={word} />
    </button>
  );
}
