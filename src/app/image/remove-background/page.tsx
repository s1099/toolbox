"use client";

import {
  Alert02Icon,
  Download04Icon,
  ImageUpload01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import Image from "next/image";
import {
  type CSSProperties,
  type DragEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { cn } from "@/lib/utils";

const PERCENT = 100;
const HALF = 50;
const EXTENSION = /\.[^.]+$/;

// Solid colours to put behind the cut-out, both on screen and in the
// downloaded PNG. Null keeps the background transparent.
const SWATCHES = [
  { color: null, label: "Transparent" },
  { color: "#ffffff", label: "White" },
  { color: "#000000", label: "Black" },
] as const;

type Backdrop = string | null;

// Two-tone grid that reads as "transparent" in image editors.
const CHECKERBOARD =
  "bg-[repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)] bg-size-[20px_20px]";

interface Source {
  height: number;
  name: string;
  url: string;
  width: number;
}

type Status =
  | { phase: "idle" }
  | { phase: "loading"; percent: number | null }
  | { phase: "processing" }
  | { phase: "done"; url: string }
  | { phase: "error"; message: string };

export default function RemoveBackgroundPage() {
  const [source, setSource] = useState<Source | null>(null);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [backdrop, setBackdrop] = useState<Backdrop>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status.phase === "loading" || status.phase === "processing";

  const sourceUrl = source?.url;
  useEffect(
    () => () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    },
    [sourceUrl]
  );

  const resultUrl = status.phase === "done" ? status.url : undefined;
  useEffect(
    () => () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    },
    [resultUrl]
  );

  const run = async (file: Blob) => {
    setStatus({ percent: null, phase: "loading" });
    try {
      const { removeBackground } = await import("@/lib/remove-background");
      const blob = await removeBackground(file, (progress) => {
        if (progress.phase === "processing") {
          setStatus({ phase: "processing" });
          return;
        }
        // Whole percent, so the stream of per-chunk events only re-renders
        // when the number on screen changes.
        const percent =
          progress.total > 0
            ? Math.floor((progress.loaded / progress.total) * PERCENT)
            : null;
        setStatus((current) =>
          current.phase === "loading" && current.percent === percent
            ? current
            : { percent, phase: "loading" }
        );
      });
      setStatus({ phase: "done", url: URL.createObjectURL(blob) });
    } catch (cause) {
      setStatus({
        message:
          cause instanceof Error
            ? cause.message
            : "Couldn't remove the background.",
        phase: "error",
      });
    }
  };

  // Removing the background is the only thing to do with an image here, so it
  // starts as soon as one arrives.
  const handleFile = async (file: File | undefined) => {
    if (!file || busy) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus({ message: "That file isn't an image.", phase: "error" });
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setSource({
        height: bitmap.height,
        name: file.name,
        url: URL.createObjectURL(file),
        width: bitmap.width,
      });
      bitmap.close();
    } catch {
      setStatus({ message: "Couldn't read that image.", phase: "error" });
      return;
    }
    await run(file);
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

  const retry = async () => {
    if (!source) {
      return;
    }
    await run(await fetch(source.url).then((response) => response.blob()));
  };

  const download = async () => {
    if (status.phase !== "done" || !source) {
      return;
    }
    const url = await flatten(status.url, backdrop);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${source.name.replace(EXTENSION, "")}-no-bg.png`;
    link.click();
    if (url !== status.url) {
      URL.revokeObjectURL(url);
    }
  };

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
        <h1 className="font-heading font-semibold text-lg">
          Remove background
        </h1>
        {source ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-muted-foreground text-sm max-sm:order-last max-sm:basis-full">
            <span className="truncate">{source.name}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {source.width}×{source.height}
            </span>
          </span>
        ) : null}
        {source ? (
          <div className="ml-auto flex items-center gap-2">
            <Button
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon icon={ImageUpload01Icon} strokeWidth={2} />
              New image
            </Button>
            <Button
              disabled={status.phase !== "done"}
              onClick={download}
              size="sm"
            >
              <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
              Download
            </Button>
          </div>
        ) : null}
      </div>

      {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target, the buttons are the keyboard path */}
      {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop target, the buttons are the keyboard path */}
      <div
        className="relative flex min-h-96 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 shadow-well data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5"
        data-dragging={dragging}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={handleDrop}
      >
        {source ? (
          <Stage
            backdrop={backdrop}
            onRetry={retry}
            source={source}
            status={status}
          />
        ) : (
          <DropPrompt
            error={status.phase === "error" ? status.message : null}
            onChoose={() => inputRef.current?.click()}
          />
        )}

        {status.phase === "done" ? (
          <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
            <BackdropPicker onChange={setBackdrop} value={backdrop} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DropPrompt({
  error,
  onChoose,
}: {
  error: string | null;
  onChoose: () => void;
}) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-5 rounded-lg border-2 border-muted-foreground/20 border-dashed p-6 text-center">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl border bg-card shadow-surface",
          CHECKERBOARD,
          "bg-size-[10px_10px]"
        )}
      >
        <HugeiconsIcon
          className="size-6"
          icon={ImageUpload01Icon}
          strokeWidth={2}
        />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="font-heading font-medium text-base">
          Drop, paste or choose an image
        </p>
        <p className="text-muted-foreground text-sm">
          The subject is cut out automatically. Everything runs in your browser,
          so the image never leaves your device.
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
      {error ? <ErrorNote message={error} /> : null}
    </div>
  );
}

function Stage({
  backdrop,
  onRetry,
  source,
  status,
}: {
  backdrop: Backdrop;
  onRetry: () => void;
  source: Source;
  status: Status;
}) {
  // Size containment lets the image box work out the largest size that fits
  // both dimensions from the stage's own width and height.
  return (
    <div className="flex flex-1 items-center justify-center p-4 pb-16 [container-type:size]">
      <div
        className="relative"
        style={{
          aspectRatio: `${source.width} / ${source.height}`,
          width: `min(100cqw, 100cqh * ${source.width / source.height})`,
        }}
      >
        {status.phase === "done" ? (
          <Compare
            backdrop={backdrop}
            original={source.url}
            result={status.url}
            source={source}
          />
        ) : (
          <Picture
            className={cn(
              "rounded-md",
              (status.phase === "loading" || status.phase === "processing") &&
                "opacity-60 saturate-50",
              status.phase === "error" && "opacity-40"
            )}
            source={source}
            src={source.url}
          />
        )}

        {status.phase === "processing" ? <ScanLine /> : null}

        {status.phase === "loading" || status.phase === "processing" ? (
          <div className="absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center px-3">
            <div className="flex w-full max-w-xs flex-col gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-surface backdrop-blur">
              <ShimmeringText
                className="text-sm"
                text={progressLabel(status)}
              />
              {status.phase === "loading" ? (
                <Progress value={status.percent} />
              ) : null}
            </div>
          </div>
        ) : null}

        {status.phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
            <ErrorNote message={status.message} />
            <Button onClick={onRetry} size="sm" variant="outline">
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function progressLabel(status: Status) {
  if (status.phase === "processing") {
    return "Cutting out the subject…";
  }
  if (status.phase === "loading" && status.percent !== null) {
    return `Downloading model… ${status.percent}%`;
  }
  return "Loading model…";
}

// Before/after slider: the result fills the box and the original is clipped
// to the left of the handle. A transparent range input on top does the
// dragging, so it works with touch, mouse and arrow keys for free.
function Compare({
  backdrop,
  original,
  result,
  source,
}: {
  backdrop: Backdrop;
  original: string;
  result: string;
  source: Source;
}) {
  const [split, setSplit] = useState(HALF);

  return (
    <div className="relative overflow-hidden rounded-md shadow-surface">
      <div
        className={cn("absolute inset-0", backdrop === null && CHECKERBOARD)}
        style={backdrop === null ? undefined : { backgroundColor: backdrop }}
      />
      <Picture className="relative" source={source} src={result} />
      <Picture
        className="absolute inset-0"
        source={source}
        src={original}
        style={{ clipPath: `inset(0 ${PERCENT - split}% 0 0)` }}
      />

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.2)]"
        style={{ left: `${split}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
          <svg
            aria-hidden="true"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 16 16"
          >
            <path d="M6 4 2 8l4 4M10 4l4 4-4 4" />
          </svg>
        </div>
      </div>

      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 font-medium text-white text-xs">
        Original
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-medium text-white text-xs">
        Result
      </span>

      <input
        aria-label="Compare original and result"
        className="absolute inset-0 size-full cursor-ew-resize appearance-none opacity-0"
        max={PERCENT}
        min={0}
        onChange={(event) => setSplit(Number(event.target.value))}
        type="range"
        value={split}
      />
    </div>
  );
}

function ScanLine() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
      <motion.div
        animate={{ top: ["0%", "100%"] }}
        className="absolute inset-x-0 h-16 -translate-y-full bg-linear-to-b from-transparent to-primary/40"
        transition={{
          duration: 1.6,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "reverse",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-primary" />
      </motion.div>
    </div>
  );
}

function BackdropPicker({
  onChange,
  value,
}: {
  onChange: (value: Backdrop) => void;
  value: Backdrop;
}) {
  const isCustom =
    value !== null && !SWATCHES.some((swatch) => swatch.color === value);

  return (
    <fieldset className="flex items-center gap-1.5 rounded-full border bg-card/95 p-1.5 shadow-surface backdrop-blur">
      <legend className="sr-only">Background</legend>
      {SWATCHES.map((swatch) => (
        <button
          aria-label={swatch.label}
          aria-pressed={value === swatch.color}
          className={cn(
            "size-7 rounded-full border outline-none ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary",
            swatch.color === null && CHECKERBOARD,
            swatch.color === null && "bg-size-[8px_8px]"
          )}
          key={swatch.label}
          onClick={() => onChange(swatch.color)}
          style={
            swatch.color === null
              ? undefined
              : { backgroundColor: swatch.color }
          }
          title={swatch.label}
          type="button"
        />
      ))}
      <label
        className={cn(
          "relative size-7 cursor-pointer rounded-full border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ring-offset-2 ring-offset-card transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
          isCustom && "ring-2 ring-primary"
        )}
        style={isCustom ? { background: value } : undefined}
        title="Custom colour"
      >
        <span className="sr-only">Custom colour</span>
        <input
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={isCustom ? value : "#3b82f6"}
        />
      </label>
    </fieldset>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
      {message}
    </p>
  );
}

function Picture({
  className,
  source,
  src,
  style,
}: {
  className?: string;
  source: Source;
  src: string;
  style?: CSSProperties;
}) {
  return (
    <Image
      alt={source.name}
      className={cn("block size-full object-contain", className)}
      draggable={false}
      height={source.height}
      src={src}
      style={style}
      unoptimized
      width={source.width}
    />
  );
}

// Paints the cut-out over a solid colour so the download matches the preview.
async function flatten(url: string, color: Backdrop): Promise<string> {
  if (color === null) {
    return url;
  }
  const bitmap = await createImageBitmap(
    await fetch(url).then((response) => response.blob())
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return url;
  }
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  return blob ? URL.createObjectURL(blob) : url;
}
