"use client";

import {
  FitToScreenIcon,
  ImageActualSizeIcon,
  SearchAddIcon,
  SearchMinusIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Rect } from "@/lib/upscale-tiles";
import { cn } from "@/lib/utils";

// Space kept clear around the image when fitting it, and below it for the
// floating toolbar.
const PADDING = 24;
const TOOLBAR_SPACE = 56;
// Zoom limits: half the fitted size, and 8 screen pixels per output pixel.
const MIN_ZOOM_OF_FIT = 0.5;
const MAX_OUTPUT_ZOOM = 8;
const ZOOM_STEP = 1.5;
const WHEEL_SENSITIVITY = 0.002;
const LINE_HEIGHT = 16;
// From this many screen pixels per output pixel, show hard pixel edges so
// what you inspect is the actual result, not the browser's smoothing.
const PIXELATED_FROM = 2;
const SPLIT_STEP = 0.01;
const HALF = 0.5;
const PERCENT = 100;

interface Point {
  x: number;
  y: number;
}

interface View extends Point {
  /** Screen pixels per source pixel. */
  zoom: number;
}

interface Size {
  height: number;
  width: number;
}

export interface TileProgress {
  /** Tiles before this index are finished; this one is in progress. */
  done: number;
  rects: Rect[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function fitView(size: Size, width: number, height: number): View {
  const zoom = Math.max(
    Math.min(
      (size.width - PADDING * 2) / width,
      (size.height - PADDING * 2 - TOOLBAR_SPACE) / height
    ),
    Number.EPSILON
  );
  return {
    x: (size.width - width * zoom) / 2,
    y: (size.height - TOOLBAR_SPACE - height * zoom) / 2,
    zoom,
  };
}

/**
 * Pan-and-zoom view of an image being upscaled. The source sits underneath,
 * smoothly enlarged by the browser; the result canvas is laid over it at the
 * same size, so tiles appear in place as they finish. Once done, a split
 * handle compares the two at any zoom.
 */
export function Viewer({
  alt,
  canvas,
  compare,
  dimmed,
  height,
  progress,
  scale,
  src,
  width,
}: {
  alt: string;
  /** The result, at output resolution. Tiles are drawn into it as they land. */
  canvas: HTMLCanvasElement | null;
  compare: boolean;
  dimmed: boolean;
  /** Source height in pixels. */
  height: number;
  progress: TileProgress | null;
  /** Output pixels per source pixel, for zoom percentages. */
  scale: number;
  src: string;
  /** Source width in pixels. */
  width: number;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const [size, setSize] = useState<Size>({ height: 0, width: 0 });
  // Null means "fit to the viewport", which follows resizes.
  const [manual, setManual] = useState<View | null>(null);
  const [split, setSplit] = useState(HALF);
  const [grabbing, setGrabbing] = useState(false);

  const fit = fitView(size, width, height);
  const view = manual ?? fit;
  const minZoom = fit.zoom * MIN_ZOOM_OF_FIT;
  const maxZoom = Math.max(fit.zoom, scale * MAX_OUTPUT_ZOOM);
  const outputZoom = view.zoom / scale;
  const center = { x: size.width / 2, y: (size.height - TOOLBAR_SPACE) / 2 };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // The canvas is created outside React (tiles are drawn into it before it's
  // ever rendered), so it's attached by hand.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (canvas) {
      canvas.className = "block size-full";
      host.replaceChildren(canvas);
    } else {
      host.replaceChildren();
    }
  }, [canvas]);

  const zoomAt = (factor: number, point: Point) => {
    setManual((current) => {
      const base = current ?? fit;
      const zoom = clamp(base.zoom * factor, minZoom, maxZoom);
      const ratio = zoom / base.zoom;
      return {
        x: point.x - (point.x - base.x) * ratio,
        y: point.y - (point.y - base.y) * ratio,
        zoom,
      };
    });
  };

  const zoomTo = (zoom: number) => zoomAt(zoom / view.zoom, center);

  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    const delta =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * LINE_HEIGHT
        : event.deltaY;
    zoomAt(Math.exp(-delta * WHEEL_SENSITIVITY), {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  });

  // React's wheel listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const listener = (event: WheelEvent) => onWheel(event);
    viewport.addEventListener("wheel", listener, { passive: false });
    return () => viewport.removeEventListener("wheel", listener);
  }, []);

  const toViewport = (event: MouseEvent<HTMLElement>): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, toViewport(event));
    setGrabbing(true);
  };

  // One pointer pans; two pinch-zoom around their midpoint.
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) {
      return;
    }
    const next = toViewport(event);
    const other = [...active].find(([id]) => id !== event.pointerId)?.[1];
    active.set(event.pointerId, next);

    if (other) {
      const before = midpoint(previous, other);
      const after = midpoint(next, other);
      const factor = distance(next, other) / (distance(previous, other) || 1);
      setManual((current) => {
        const base = current ?? fit;
        const zoom = clamp(base.zoom * factor, minZoom, maxZoom);
        const ratio = zoom / base.zoom;
        return {
          x: after.x - (before.x - base.x) * ratio,
          y: after.y - (before.y - base.y) * ratio,
          zoom,
        };
      });
      return;
    }
    setManual((current) => {
      const base = current ?? fit;
      return {
        ...base,
        x: base.x + next.x - previous.x,
        y: base.y + next.y - previous.y,
      };
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      setGrabbing(false);
    }
  };

  // Double-click flips between fitting the view and actual size at that spot.
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (manual) {
      setManual(null);
      return;
    }
    zoomAt(scale / view.zoom, toViewport(event));
  };

  // The split is in viewport space; the clip is in the image's own pixels.
  const splitX = split * size.width;
  const clipLeft = clamp((splitX - view.x) / view.zoom, 0, width);
  const showCompare = compare && canvas !== null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pan surface; the toolbar buttons are the keyboard path
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: pan surface; the toolbar buttons are the keyboard path
    <div
      className={cn(
        "relative size-full touch-none select-none overflow-hidden",
        grabbing ? "cursor-grabbing" : "cursor-grab"
      )}
      onDoubleClick={handleDoubleClick}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      ref={viewportRef}
    >
      <div
        className={cn(
          "absolute top-0 left-0 origin-top-left shadow-surface transition-[opacity,filter]",
          size.width === 0 && "invisible",
          dimmed && "opacity-50 saturate-50"
        )}
        style={{
          height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          width,
        }}
      >
        <Image
          alt={alt}
          className="absolute inset-0 block size-full"
          draggable={false}
          height={height}
          src={src}
          unoptimized
          width={width}
        />
        <div
          className={cn(
            "absolute inset-0",
            outputZoom >= PIXELATED_FROM && "[image-rendering:pixelated]"
          )}
          ref={hostRef}
          style={
            showCompare ? { clipPath: `inset(0 0 0 ${clipLeft}px)` } : undefined
          }
        />
      </div>

      {progress ? <TileOverlay progress={progress} view={view} /> : null}

      {showCompare ? (
        <SplitHandle
          onChange={setSplit}
          scale={scale}
          split={split}
          viewportRef={viewportRef}
        />
      ) : null}

      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: only stops toolbar presses from starting a pan */}
        <div
          className="flex cursor-default items-center gap-0.5 rounded-full border bg-card/95 p-1 shadow-surface backdrop-blur"
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="toolbar"
        >
          <ToolbarButton
            disabled={view.zoom <= minZoom}
            icon={SearchMinusIcon}
            label="Zoom out"
            onClick={() => zoomTo(view.zoom / ZOOM_STEP)}
          />
          <span
            aria-live="polite"
            className="w-12 text-center font-mono text-muted-foreground text-xs tabular-nums"
          >
            {Math.round(outputZoom * PERCENT)}%
          </span>
          <ToolbarButton
            disabled={view.zoom >= maxZoom}
            icon={SearchAddIcon}
            label="Zoom in"
            onClick={() => zoomTo(view.zoom * ZOOM_STEP)}
          />
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            disabled={manual === null}
            icon={FitToScreenIcon}
            label="Fit to view"
            onClick={() => setManual(null)}
          />
          <ToolbarButton
            icon={ImageActualSizeIcon}
            label="Actual size"
            onClick={() => zoomTo(scale)}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: typeof SearchAddIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="rounded-full"
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Veils the tiles still to come and outlines the one being worked on, drawn in
// screen space so the outline stays crisp at any zoom.
function TileOverlay({
  progress,
  view,
}: {
  progress: TileProgress;
  view: View;
}) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {progress.rects.map((rect, index) =>
          index < progress.done ? null : (
            <rect
              className={cn(
                index === progress.done
                  ? "animate-pulse fill-primary/15 stroke-primary"
                  : "fill-background/60 stroke-foreground/10"
              )}
              height={rect.height}
              key={`${rect.x}:${rect.y}`}
              strokeWidth={index === progress.done ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              width={rect.width}
              x={rect.x}
              y={rect.y}
            />
          )
        )}
      </g>
    </svg>
  );
}

function SplitHandle({
  onChange,
  scale,
  split,
  viewportRef,
}: {
  onChange: (split: number) => void;
  scale: number;
  split: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const move = (clientX: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      onChange(clamp((clientX - rect.left) / rect.width, 0, 1));
    }
  };

  return (
    <>
      <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/60 px-1.5 py-0.5 font-medium text-white text-xs">
        Original
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-black/60 px-1.5 py-0.5 font-medium text-white text-xs">
        Upscaled {scale}×
      </span>
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
        style={{ left: `${split * PERCENT}%` }}
      >
        {/* The range input is the keyboard and screen reader control; the grip
            beside it takes the pointer. */}
        <input
          aria-label="Compare original and upscaled"
          className="peer sr-only"
          max={PERCENT}
          min={0}
          onChange={(event) => onChange(Number(event.target.value) / PERCENT)}
          step={SPLIT_STEP * PERCENT}
          type="range"
          value={Math.round(split * PERCENT)}
        />
        <div
          aria-hidden="true"
          className="pointer-events-auto absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white text-black shadow-md ring-ring/50 peer-focus-visible:ring-3"
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              move(event.clientX);
            }
          }}
        >
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
    </>
  );
}
