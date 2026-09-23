"use client";

import {
  Alert02Icon,
  Copy01Icon,
  ImageUpload01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OcrResult } from "@/lib/ocr";

// TODO: Investigate why det bounding boxes arent sometimes rendering on chrome android

type Preview = { url: string; width: number; height: number; name: string };

const PERCENT = 100;

export default function OcrPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  // Whole percent, so a stream of per-chunk events only re-renders when the
  // number on screen actually changes. Null until the download size is known.
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pending = percent !== null && percent < PERCENT;

  const previewUrl = preview?.url;
  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  const handleFile = async (file: File | undefined) => {
    if (!file?.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }

    setError(null);
    setResult(null);
    setBusy(true);

    const [bitmap, { runOcr }] = await Promise.all([
      createImageBitmap(file),
      import("@/lib/ocr"),
    ]);
    setPreview({
      height: bitmap.height,
      name: file.name,
      url: URL.createObjectURL(file),
      width: bitmap.width,
    });

    try {
      setResult(
        await runOcr(bitmap, ({ loaded, total }) =>
          setPercent(total > 0 ? Math.floor((loaded / total) * PERCENT) : null)
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recognition failed.");
    } finally {
      setBusy(false);
      bitmap.close();
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(result?.text ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2 md:overflow-hidden">
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-heading font-semibold text-lg">OCR</h1>
          <Button onClick={() => inputRef.current?.click()} size="sm">
            <HugeiconsIcon icon={ImageUpload01Icon} strokeWidth={2} />
            Choose image
          </Button>
        </div>

        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />

        {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target, the button above is the keyboard path */}
        <div
          className="flex min-h-48 flex-1 items-center justify-center overflow-auto rounded-xl border border-dashed bg-muted/30 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          {preview ? (
            <div
              className="relative max-h-full max-w-full"
              style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
            >
              <Image
                alt={preview.name}
                className="h-full w-full object-contain"
                height={preview.height}
                src={preview.url}
                unoptimized
                width={preview.width}
              />
              {result && result.lines.length > 0 && (
                <svg
                  // The wrapper is exactly the image's box, so the viewBox maps
                  // 1:1 onto the coordinates the detector reported.
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  preserveAspectRatio="none"
                  viewBox={`0 0 ${preview.width} ${preview.height}`}
                >
                  {result.lines.map((line) => (
                    <rect
                      className="fill-primary/10 stroke-primary/70"
                      height={line.box.y1 - line.box.y0}
                      key={`${line.box.x0},${line.box.y0},${line.box.x1},${line.box.y1}`}
                      strokeWidth={1.5}
                      // Keeps the outline hairline-thin at any zoom, instead of
                      // scaling with the viewBox.
                      vectorEffect="non-scaling-stroke"
                      width={line.box.x1 - line.box.x0}
                      x={line.box.x0}
                      y={line.box.y0}
                    />
                  ))}
                </svg>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Drop an image here or choose one.
            </p>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex h-8 items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {result ? `${result.lines.length} lines` : "Extracted text"}
          </span>
          {result && result.text.length > 0 && (
            <Button onClick={copy} size="sm" variant="outline">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            {error}
          </p>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              strokeWidth={2}
            />
            {pending ? `Downloading models… ${percent}%` : "Reading image…"}
          </div>
        )}

        <Textarea
          className="min-h-48 flex-1 resize-none font-mono text-sm"
          placeholder="..."
          readOnly
          value={result?.text ?? ""}
        />
      </section>
    </div>
  );
}
