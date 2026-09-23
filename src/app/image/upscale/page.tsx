"use client";

import {
  Alert02Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  ImageUpload01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import {
  findModel,
  isModelCached,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
  MODELS,
  type ModelKey,
  type UpscalePlan,
  upscale,
} from "@/lib/upscale";
import { cn } from "@/lib/utils";
import { Viewer } from "./viewer";

const PERCENT = 100;
const MEGA = 1_000_000;
const SECOND = 1000;
const MINUTE = 60;
const TICK_MS = 1000;
const EXTENSION = /\.[^.]+$/;
const ENCODE_QUALITY = 0.92;

const DEFAULT_MODEL: Record<2 | 4, ModelKey> = { 2: "detail-2", 4: "photo-4" };

const FORMATS = [
  { extension: "png", label: "PNG", type: "image/png" },
  { extension: "jpg", label: "JPEG", type: "image/jpeg" },
  { extension: "webp", label: "WebP", type: "image/webp" },
] as const;

type Format = (typeof FORMATS)[number];

interface Source {
  file: File;
  height: number;
  name: string;
  url: string;
  width: number;
}

type Job =
  | { phase: "idle" }
  | { model: ModelKey; percent: number | null; phase: "loading" }
  | {
      done: number;
      doneArea: number;
      model: ModelKey;
      phase: "running";
      plan: UpscalePlan;
      startedAt: number;
    }
  | { model: ModelKey; ms: number; phase: "done"; plan: UpscalePlan }
  | { message: string; phase: "error" };

// A 4×4 blocky blob beside its smooth counterpart, for the empty state.
const PIXEL_BLOB = [
  0.08, 0.3, 0.3, 0.08, 0.3, 0.85, 0.85, 0.3, 0.3, 0.85, 0.85, 0.3, 0.08, 0.3,
  0.3, 0.08,
].map((opacity, index) => ({ id: `cell-${index}`, opacity }));

export default function UpscalePage() {
  const [source, setSource] = useState<Source | null>(null);
  const [job, setJob] = useState<Job>({ phase: "idle" });
  const [modelKey, setModelKey] = useState<ModelKey>(DEFAULT_MODEL[4]);
  const [result, setResult] = useState<HTMLCanvasElement | null>(null);
  const [cached, setCached] = useState<Partial<Record<ModelKey, boolean>>>({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const model = findModel(modelKey);
  const busy = job.phase === "loading" || job.phase === "running";

  const sourceUrl = source?.url;
  useEffect(
    () => () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    },
    [sourceUrl]
  );

  // Leaving the page stops the worker after its current tile.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Recheck what's downloaded whenever a run finishes, since it may have
  // fetched a model.
  const settled = !busy;
  useEffect(() => {
    if (!settled) {
      return;
    }
    let active = true;
    Promise.all(
      MODELS.map(async (entry) => [entry.key, await isModelCached(entry)])
    ).then((entries) => {
      if (active) {
        setCached(Object.fromEntries(entries));
      }
    });
    return () => {
      active = false;
    };
  }, [settled]);

  const start = async () => {
    if (!source || busy) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const key = modelKey;
    // Filled in by the callbacks below as the run progresses.
    const run: {
      context: CanvasRenderingContext2D | null;
      plan: UpscalePlan | null;
      startedAt: number;
    } = { context: null, plan: null, startedAt: 0 };

    setResult(null);
    setJob({ model: key, percent: null, phase: "loading" });
    try {
      await upscale(
        source.file,
        key,
        {
          onDownload: (loaded, total) => {
            // Whole percent, so the stream of per-chunk events only
            // re-renders when the number on screen changes.
            const percent =
              total > 0 ? Math.floor((loaded / total) * PERCENT) : null;
            setJob((current) =>
              current.phase === "loading" && current.percent === percent
                ? current
                : { model: key, percent, phase: "loading" }
            );
          },
          onStart: (next) => {
            const canvas = document.createElement("canvas");
            canvas.width = next.width * next.scale;
            canvas.height = next.height * next.scale;
            run.context = canvas.getContext("2d");
            run.plan = next;
            run.startedAt = Date.now();
            setResult(canvas);
            setJob({
              done: 0,
              doneArea: 0,
              model: key,
              phase: "running",
              plan: next,
              startedAt: run.startedAt,
            });
          },
          onTile: (index, pixels) => {
            const { context, plan } = run;
            if (!plan) {
              return;
            }
            const rect = plan.tiles[index];
            context?.putImageData(
              pixels,
              rect.x * plan.scale,
              rect.y * plan.scale
            );
            setJob((current) =>
              current.phase === "running"
                ? {
                    ...current,
                    done: index + 1,
                    doneArea: current.doneArea + rect.width * rect.height,
                  }
                : current
            );
          },
        },
        controller.signal
      );
      if (run.plan) {
        setJob({
          model: key,
          ms: Date.now() - run.startedAt,
          phase: "done",
          plan: run.plan,
        });
      }
    } catch (cause) {
      setResult(null);
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setJob({ phase: "idle" });
        return;
      }
      setJob({
        message:
          cause instanceof Error
            ? cause.message
            : "Couldn't upscale the image.",
        phase: "error",
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setJob({ message: "That file isn't an image.", phase: "error" });
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setSource({
        file,
        height: bitmap.height,
        name: file.name,
        url: URL.createObjectURL(file),
        width: bitmap.width,
      });
      bitmap.close();
      setResult(null);
      setJob({ phase: "idle" });
    } catch {
      setJob({ message: "Couldn't read that image.", phase: "error" });
    }
  };

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const file = [...(event.clipboardData?.files ?? [])].find((item) =>
      item.type.startsWith("image/")
    );
    if (file) {
      event.preventDefault();
      handleFile(file);
    }
  });

  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, []);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files[0]);
  };

  const chooseFile = () => inputRef.current?.click();

  // What the viewer shows: the finished or in-progress result's scale, or the
  // one picked for the next run.
  const plan =
    job.phase === "running" || job.phase === "done" ? job.plan : null;
  const viewScale = plan?.scale ?? model.scale;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-heading font-semibold text-lg">Upscale</h1>
        {source ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-muted-foreground text-sm max-sm:order-last max-sm:basis-full">
            <span className="truncate">{source.name}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {source.width}×{source.height}
            </span>
          </span>
        ) : null}
        {source ? (
          <Button
            className="ml-auto"
            disabled={busy}
            onClick={chooseFile}
            size="sm"
            variant="outline"
          >
            <HugeiconsIcon icon={ImageUpload01Icon} strokeWidth={2} />
            New image
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 gap-3 max-lg:flex-col lg:min-h-0">
        {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target, the buttons are the keyboard path */}
        {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop target, the buttons are the keyboard path */}
        <div
          className="relative flex min-h-96 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 shadow-well data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5 max-lg:h-[60svh]"
          data-dragging={dragging}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={handleDrop}
        >
          {source ? (
            <Viewer
              alt={source.name}
              canvas={result}
              compare={job.phase === "done"}
              dimmed={job.phase === "loading"}
              height={source.height}
              key={source.url}
              progress={
                job.phase === "running"
                  ? { done: job.done, rects: job.plan.tiles }
                  : null
              }
              scale={viewScale}
              src={source.url}
              width={source.width}
            />
          ) : (
            <DropPrompt onChoose={chooseFile} />
          )}
        </div>

        <aside className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-surface lg:w-80 lg:shrink-0 lg:overflow-y-auto">
          <ScalePicker
            disabled={busy}
            onChange={(scale) => setModelKey(DEFAULT_MODEL[scale])}
            value={model.scale}
          />
          <ModelPicker
            cached={cached}
            disabled={busy}
            onChange={setModelKey}
            scale={model.scale}
            value={modelKey}
          />
          <OutputSize scale={model.scale} source={source} />
          <div className="mt-auto flex flex-col gap-3 border-t pt-4">
            <Actions
              cached={cached[modelKey] ?? false}
              job={job}
              modelKey={modelKey}
              onCancel={() => abortRef.current?.abort()}
              onStart={start}
              result={result}
              source={source}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function DropPrompt({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-5 rounded-lg border-2 border-muted-foreground/20 border-dashed p-6 text-center">
      <div aria-hidden="true" className="flex items-center gap-3">
        <div className="grid size-12 grid-cols-4 overflow-hidden rounded-xl border bg-card shadow-surface">
          {PIXEL_BLOB.map((cell) => (
            <span
              className="bg-foreground"
              key={cell.id}
              style={{ opacity: cell.opacity }}
            />
          ))}
        </div>
        <HugeiconsIcon
          className="size-4 text-muted-foreground"
          icon={ArrowRight02Icon}
          strokeWidth={2}
        />
        <div className="size-12 rounded-xl border bg-[radial-gradient(circle,var(--color-foreground)_0%,color-mix(in_oklch,var(--color-foreground)_40%,transparent)_45%,transparent_72%)] bg-card shadow-surface" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="font-heading font-medium text-base">
          Drop, paste or choose an image
        </p>
        <p className="text-muted-foreground text-sm">
          Enlarge it 2× or 4× with the detail filled in rather than blurred.
          Everything runs in your browser, so the image never leaves your
          device.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onChoose}>
          <HugeiconsIcon icon={ImageUpload01Icon} strokeWidth={2} />
          Choose image
        </Button>
        <span className="flex items-center gap-1 text-muted-foreground text-xs max-md:hidden">
          or <Kbd>Ctrl</Kbd>
          <Kbd>V</Kbd>
        </span>
      </div>
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function ScalePicker({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (scale: 2 | 4) => void;
  value: 2 | 4;
}) {
  return (
    <Section title="Scale">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 shadow-well">
        {([2, 4] as const).map((scale) => (
          <label
            className="flex h-9 cursor-pointer items-center justify-center rounded-md font-heading font-semibold text-lg text-muted-foreground transition-colors hover:text-foreground has-disabled:cursor-not-allowed has-checked:bg-background has-checked:text-foreground has-disabled:opacity-50 has-checked:shadow-raised has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:has-checked:bg-input/50"
            key={scale}
          >
            <input
              checked={value === scale}
              className="sr-only"
              disabled={disabled}
              name="scale"
              onChange={() => onChange(scale)}
              type="radio"
            />
            {scale}×
          </label>
        ))}
      </div>
    </Section>
  );
}

function ModelPicker({
  cached,
  disabled,
  onChange,
  scale,
  value,
}: {
  cached: Partial<Record<ModelKey, boolean>>;
  disabled: boolean;
  onChange: (key: ModelKey) => void;
  scale: 2 | 4;
  value: ModelKey;
}) {
  return (
    <Section title="Tuned for">
      {MODELS.filter((entry) => entry.scale === scale).map((entry) => (
        <label
          className="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50 has-disabled:cursor-not-allowed has-checked:border-primary has-checked:bg-primary/5 has-disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          key={entry.key}
        >
          <span className="flex items-center gap-2">
            <input
              checked={value === entry.key}
              className="sr-only"
              disabled={disabled}
              name="model"
              onChange={() => onChange(entry.key)}
              type="radio"
            />
            <span className="font-medium text-sm">{entry.name}</span>
            <span className="ml-auto flex items-center gap-1 font-mono text-muted-foreground text-xs tabular-nums">
              {cached[entry.key] ? (
                <>
                  <HugeiconsIcon
                    className="size-3.5"
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                  />
                  Saved
                </>
              ) : (
                formatBytes(entry.downloadBytes)
              )}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {entry.description}
          </span>
        </label>
      ))}
    </Section>
  );
}

function OutputSize({
  scale,
  source,
}: {
  scale: number;
  source: Source | null;
}) {
  const outWidth = source ? source.width * scale : 0;
  const outHeight = source ? source.height * scale : 0;
  const tooLarge = source !== null && isTooLarge(source, scale);

  return (
    <Section title="Output">
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 font-mono text-xs tabular-nums shadow-well">
        <Dimensions height={source?.height} muted width={source?.width} />
        <HugeiconsIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          icon={ArrowRight02Icon}
          strokeWidth={2}
        />
        <Dimensions
          height={source ? outHeight : undefined}
          width={source ? outWidth : undefined}
        />
      </div>
      {tooLarge ? (
        <ErrorNote
          message={`That's ${formatMegapixels(outWidth * outHeight)} — too large to create in the browser. Try ${scale === 4 ? "2× or " : ""}a smaller image.`}
        />
      ) : null}
    </Section>
  );
}

function Dimensions({
  height,
  muted,
  width,
}: {
  height?: number;
  muted?: boolean;
  width?: number;
}) {
  const known = width !== undefined && height !== undefined;
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      <span className="truncate">{known ? `${width} × ${height}` : "—"}</span>
      <span className="text-[0.7rem] text-muted-foreground">
        {known ? formatMegapixels(width * height) : "No image"}
      </span>
    </span>
  );
}

function Actions({
  cached,
  job,
  modelKey,
  onCancel,
  onStart,
  result,
  source,
}: {
  cached: boolean;
  job: Job;
  modelKey: ModelKey;
  onCancel: () => void;
  onStart: () => void;
  result: HTMLCanvasElement | null;
  source: Source | null;
}) {
  if (job.phase === "loading") {
    return (
      <>
        <ShimmeringText
          className="text-sm"
          text={
            job.percent === null
              ? "Loading model…"
              : `Downloading model… ${job.percent}%`
          }
        />
        <Progress value={job.percent} />
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
      </>
    );
  }

  if (job.phase === "running") {
    return <Running job={job} onCancel={onCancel} />;
  }

  const model = findModel(modelKey);
  const canStart = source !== null && !isTooLarge(source, model.scale);

  if (job.phase === "done" && result && source) {
    return (
      <>
        <p className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="size-4 text-muted-foreground"
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
          />
          Done in {formatDuration(job.ms)} on{" "}
          {job.plan.device === "webgpu" ? "the GPU" : "the CPU"}
        </p>
        <SaveResult canvas={result} plan={job.plan} source={source} />
        {job.model === modelKey ? null : (
          <Button
            disabled={!canStart}
            onClick={onStart}
            size="lg"
            variant="outline"
          >
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
            Upscale again
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      {job.phase === "error" ? <ErrorNote message={job.message} /> : null}
      <Button disabled={!canStart} onClick={onStart} size="lg">
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
        Upscale {model.scale}×
      </Button>
      <p className="text-center text-muted-foreground text-xs">
        {cached
          ? "Model saved. Works offline."
          : `Downloads ${formatBytes(model.downloadBytes)} once, then works offline.`}
      </p>
    </>
  );
}

function Running({
  job,
  onCancel,
}: {
  job: Extract<Job, { phase: "running" }>;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const total = job.plan.tiles.length;
  const totalArea = job.plan.width * job.plan.height;
  const elapsed = Math.max(now - job.startedAt, 0);
  // Tiles differ in size at the edges, so estimate from area, not count.
  const remaining =
    job.doneArea > 0
      ? (elapsed / job.doneArea) * (totalArea - job.doneArea)
      : null;
  const onCpu = job.plan.device === "wasm";

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <ShimmeringText className="text-sm" text="Upscaling…" />
        <span className="rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
          {onCpu ? "CPU" : "GPU"}
        </span>
      </div>
      <Progress value={(job.doneArea / totalArea) * PERCENT} />
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Stat
          label="Tile"
          value={`${Math.min(job.done + 1, total)}/${total}`}
        />
        <Stat label="Elapsed" value={formatClock(elapsed)} />
        <Stat
          label="Left"
          value={remaining === null ? "…" : `~${formatClock(remaining)}`}
        />
      </dl>
      {onCpu ? (
        <p className="text-muted-foreground text-xs">
          Running on the CPU, which is slow for this model. A browser with
          WebGPU (recent Chrome, Edge or Safari) is many times faster.
        </p>
      ) : null}
      <Button onClick={onCancel} variant="outline">
        Cancel
      </Button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-2 py-1.5 shadow-well">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function SaveResult({
  canvas,
  plan,
  source,
}: {
  canvas: HTMLCanvasElement;
  plan: UpscalePlan;
  source: Source;
}) {
  const [format, setFormat] = useState<Format>(FORMATS[0]);
  const [saving, setSaving] = useState(false);
  // JPEG has no alpha channel, so it would turn transparency black.
  const available = FORMATS.filter(
    (entry) => !(plan.transparent && entry.type === "image/jpeg")
  );

  const save = async () => {
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, format.type, ENCODE_QUALITY)
      );
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${source.name.replace(EXTENSION, "")}-${plan.scale}x.${format.extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <fieldset className="flex rounded-lg bg-muted p-0.5 shadow-well">
        <legend className="sr-only">Format</legend>
        {available.map((entry) => (
          <label
            className="flex cursor-pointer items-center rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-raised has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:has-checked:bg-input/50"
            key={entry.type}
          >
            <input
              checked={format.type === entry.type}
              className="sr-only"
              name="format"
              onChange={() => setFormat(entry)}
              type="radio"
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      <Button className="flex-1" disabled={saving} onClick={save} size="lg">
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
        {saving ? "Saving…" : "Download"}
      </Button>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
      <HugeiconsIcon
        className="mt-0.5 shrink-0"
        icon={Alert02Icon}
        strokeWidth={2}
      />
      {message}
    </p>
  );
}

function isTooLarge(source: Source, scale: number) {
  const width = source.width * scale;
  const height = source.height * scale;
  return (
    width * height > MAX_OUTPUT_PIXELS ||
    Math.max(width, height) > MAX_OUTPUT_SIDE
  );
}

function formatBytes(bytes: number) {
  const megabytes = bytes / MEGA;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

function formatMegapixels(pixels: number) {
  const megapixels = pixels / MEGA;
  return `${megapixels < 10 ? megapixels.toFixed(2) : megapixels.toFixed(1)} MP`;
}

function formatClock(ms: number) {
  const seconds = Math.round(ms / SECOND);
  return `${Math.floor(seconds / MINUTE)}:${String(seconds % MINUTE).padStart(2, "0")}`;
}

function formatDuration(ms: number) {
  const seconds = Math.max(Math.round(ms / SECOND), 1);
  if (seconds < MINUTE) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / MINUTE);
  const rest = seconds % MINUTE;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
