"use client";

import type { CharacterAlignmentResponseModel } from "@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTimeLabel,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar";
import {
  type SegmentComposer,
  type TranscriptSegment,
  type TranscriptWord as TranscriptWordType,
  type UseTranscriptViewerResult,
  useTranscriptViewer,
} from "@/hooks/use-transcript-viewer";
import { cn } from "@/lib/utils";

type TranscriptGap = Extract<TranscriptSegment, { kind: "gap" }>;

type TranscriptViewerContextValue = UseTranscriptViewerResult & {
  audioProps: Omit<ComponentPropsWithRef<"audio">, "children" | "src">;
};

const TranscriptViewerContext =
  createContext<TranscriptViewerContextValue | null>(null);

function useTranscriptViewerContext() {
  const context = useContext(TranscriptViewerContext);
  if (!context) {
    throw new Error(
      "useTranscriptViewerContext must be used within a TranscriptViewer"
    );
  }
  return context;
}

type TranscriptViewerProviderProps = {
  value: TranscriptViewerContextValue;
  children: ReactNode;
};

function TranscriptViewerProvider({
  value,
  children,
}: TranscriptViewerProviderProps) {
  return (
    <TranscriptViewerContext.Provider value={value}>
      {children}
    </TranscriptViewerContext.Provider>
  );
}

type AudioType =
  | "audio/mpeg"
  | "audio/wav"
  | "audio/ogg"
  | "audio/mp3"
  | "audio/m4a"
  | "audio/aac"
  | "audio/webm";

type TranscriptViewerContainerProps = {
  audioSrc: string;
  audioType: AudioType;
  alignment: CharacterAlignmentResponseModel;
  segmentComposer?: SegmentComposer;
  hideAudioTags?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "children"> &
  Pick<
    Parameters<typeof useTranscriptViewer>[0],
    "onPlay" | "onPause" | "onTimeUpdate" | "onEnded" | "onDurationChange"
  >;

function TranscriptViewerContainer({
  audioSrc,
  audioType = "audio/mpeg",
  alignment,
  segmentComposer,
  hideAudioTags = true,
  children,
  className,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onDurationChange,
  ...props
}: TranscriptViewerContainerProps) {
  const viewerState = useTranscriptViewer({
    alignment,
    hideAudioTags,
    onDurationChange,
    onEnded,
    onPause,
    onPlay,
    onTimeUpdate,
    segmentComposer,
  });

  const { audioRef } = viewerState;

  const audioProps = useMemo(
    () => ({
      children: <source src={audioSrc} type={audioType} />,
      controls: false,
      preload: "metadata" as const,
      ref: audioRef,
      src: audioSrc,
    }),
    [audioRef, audioSrc]
  );

  const contextValue = useMemo(
    () => ({
      ...viewerState,
      audioProps,
    }),
    [viewerState, audioProps]
  );

  return (
    <TranscriptViewerProvider value={contextValue}>
      <div
        className={cn("space-y-4 p-4", className)}
        data-slot="transcript-viewer-root"
        {...props}
      >
        {children}
      </div>
    </TranscriptViewerProvider>
  );
}

type TranscriptViewerWordStatus = "spoken" | "unspoken" | "current";
interface TranscriptViewerWordProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  children?: ReactNode;
  status: TranscriptViewerWordStatus;
  word: TranscriptWordType;
}

function TranscriptViewerWord({
  word,
  status,
  className,
  children,
  ...props
}: TranscriptViewerWordProps) {
  return (
    <span
      className={cn(
        "rounded-sm px-0.5 transition-colors",
        status === "spoken" && "text-foreground",
        status === "unspoken" && "text-muted-foreground",
        status === "current" && "bg-primary text-primary-foreground",
        className
      )}
      data-kind="word"
      data-slot="transcript-word"
      data-status={status}
      {...props}
    >
      {children ?? word.text}
    </span>
  );
}

/** A span of the transcript, e.g. one Whisper segment, shown as its own row. */
interface TranscriptSection {
  end: number;
  start: number;
}

interface TranscriptViewerWordsProps extends HTMLAttributes<HTMLDivElement> {
  gapClassNames?: string;
  renderGap?: (props: {
    segment: TranscriptGap;
    status: TranscriptViewerWordStatus;
  }) => ReactNode;
  renderWord?: (props: {
    word: TranscriptWordType;
    status: TranscriptViewerWordStatus;
  }) => ReactNode;
  /**
   * When given, words are grouped into one row per section with its start
   * time alongside; clicking the time seeks there. Omit for a single flow.
   */
  sections?: TranscriptSection[];
  wordClassNames?: string;
}

interface SegmentEntry {
  segment: TranscriptSegment;
  status: TranscriptViewerWordStatus;
}

const SECONDS_PER_MINUTE = 60;

function formatSectionTime(seconds: number) {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = Math.floor(seconds % SECONDS_PER_MINUTE);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * Assigns each entry to the last section starting at or before its word; a
 * gap stays with the word before it. Leading gaps of a row are dropped so rows
 * don't start with the space that separated them in the flat transcript.
 */
function groupBySection(
  entries: SegmentEntry[],
  sections: TranscriptSection[]
): SegmentEntry[][] {
  const groups: SegmentEntry[][] = sections.map(() => []);
  let current = 0;
  for (const entry of entries) {
    if (entry.segment.kind === "word") {
      while (
        current < sections.length - 1 &&
        entry.segment.startTime >= sections[current + 1].start
      ) {
        current += 1;
      }
    }
    const group = groups[current];
    const isLeadingGap = entry.segment.kind === "gap" && group.length === 0;
    if (!isLeadingGap) {
      group.push(entry);
    }
  }
  return groups;
}

function TranscriptViewerWords({
  className,
  renderWord,
  renderGap,
  sections,
  wordClassNames,
  gapClassNames,
  ...props
}: TranscriptViewerWordsProps) {
  const {
    spokenSegments,
    unspokenSegments,
    currentWord,
    segments,
    duration,
    currentTime,
    seekToTime,
  } = useTranscriptViewerContext();

  const nearEnd = useMemo(() => {
    if (!duration) {
      return false;
    }
    return currentTime >= duration - 0.01;
  }, [currentTime, duration]);

  const segmentsWithStatus = useMemo(() => {
    if (nearEnd) {
      return segments.map((segment) => ({
        segment,
        status: "spoken" as const,
      }));
    }

    const entries: SegmentEntry[] = [];

    for (const segment of spokenSegments) {
      entries.push({ segment, status: "spoken" });
    }

    if (currentWord) {
      entries.push({ segment: currentWord, status: "current" });
    }

    for (const segment of unspokenSegments) {
      entries.push({ segment, status: "unspoken" });
    }

    return entries;
  }, [spokenSegments, unspokenSegments, currentWord, nearEnd, segments]);

  const renderEntry = ({ segment, status }: SegmentEntry) => {
    if (segment.kind === "gap") {
      const content = renderGap ? renderGap({ segment, status }) : segment.text;
      return (
        <span
          className={cn(gapClassNames)}
          data-kind="gap"
          data-status={status}
          key={`gap-${segment.segmentIndex}`}
        >
          {content}
        </span>
      );
    }

    if (renderWord) {
      return (
        <span
          className={cn(wordClassNames)}
          data-kind="word"
          data-status={status}
          key={`word-${segment.segmentIndex}`}
        >
          {renderWord({ status, word: segment })}
        </span>
      );
    }

    return (
      <TranscriptViewerWord
        className={wordClassNames}
        key={`word-${segment.segmentIndex}`}
        status={status}
        word={segment}
      />
    );
  };

  if (!sections?.length) {
    return (
      <div
        className={cn("text-xl leading-relaxed", className)}
        data-slot="transcript-words"
        {...props}
      >
        {segmentsWithStatus.map(renderEntry)}
      </div>
    );
  }

  const groups = groupBySection(segmentsWithStatus, sections);

  return (
    <div
      className={cn("flex flex-col gap-3 text-xl leading-relaxed", className)}
      data-slot="transcript-words"
      {...props}
    >
      {sections.map((section, index) => {
        const active =
          currentTime >= section.start && currentTime < section.end;
        return (
          <div
            className="group/section grid grid-cols-[3rem_1fr] items-baseline gap-x-3"
            data-active={active}
            data-slot="transcript-section"
            key={`${section.start}-${section.end}`}
          >
            <button
              aria-label={`Play from ${formatSectionTime(section.start)}`}
              className="cursor-pointer justify-self-start rounded-sm font-mono text-muted-foreground/70 text-xs tabular-nums outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[active=true]/section:text-foreground"
              onClick={() => seekToTime(section.start)}
              type="button"
            >
              {formatSectionTime(section.start)}
            </button>
            <p>{groups[index].map(renderEntry)}</p>
          </div>
        );
      })}
    </div>
  );
}

function TranscriptViewerAudio({
  ...props
}: ComponentPropsWithoutRef<"audio">) {
  const { audioProps } = useTranscriptViewerContext();
  return (
    <audio
      data-slot="transcript-audio"
      {...audioProps}
      {...props}
      ref={audioProps.ref}
    />
  );
}

type RenderChildren = (state: { isPlaying: boolean }) => ReactNode;

type TranscriptViewerPlayPauseButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  "children"
> & {
  children?: ReactNode | RenderChildren;
};

function TranscriptViewerPlayPauseButton({
  className,
  children,
  onClick,
  ...props
}: TranscriptViewerPlayPauseButtonProps) {
  const { isPlaying, play, pause } = useTranscriptViewerContext();

  const handleClick: TranscriptViewerPlayPauseButtonProps["onClick"] = (
    event
  ) => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
    onClick?.(event);
  };

  const content =
    typeof children === "function"
      ? (children as RenderChildren)({ isPlaying })
      : children;

  return (
    <Button
      aria-label={isPlaying ? "Pause audio" : "Play audio"}
      className={cn("cursor-pointer", className)}
      data-playing={isPlaying}
      data-slot="transcript-play-pause-button"
      onClick={handleClick}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {content ?? (
        <HugeiconsIcon
          className="size-5"
          icon={isPlaying ? PauseIcon : PlayIcon}
          strokeWidth={2}
        />
      )}
    </Button>
  );
}

type TranscriptViewerScrubBarProps = Omit<
  ComponentPropsWithoutRef<typeof ScrubBarContainer>,
  "duration" | "value" | "onScrub" | "onScrubStart" | "onScrubEnd"
> & {
  showTimeLabels?: boolean;
  labelsClassName?: string;
  trackClassName?: string;
  progressClassName?: string;
  thumbClassName?: string;
};

/**
 * A context-aware implementation of the scrub bar specific to the transcript viewer.
 */
function TranscriptViewerScrubBar({
  className,
  showTimeLabels = true,
  labelsClassName,
  trackClassName,
  progressClassName,
  thumbClassName,
  ...props
}: TranscriptViewerScrubBarProps) {
  const { duration, currentTime, seekToTime, startScrubbing, endScrubbing } =
    useTranscriptViewerContext();
  return (
    <ScrubBarContainer
      className={className}
      data-slot="transcript-scrub-bar"
      duration={duration}
      onScrub={seekToTime}
      onScrubEnd={endScrubbing}
      onScrubStart={startScrubbing}
      value={currentTime}
      {...props}
    >
      <div className="flex flex-1 flex-col gap-1">
        <ScrubBarTrack className={trackClassName}>
          <ScrubBarProgress className={progressClassName} />
          <ScrubBarThumb className={thumbClassName} />
        </ScrubBarTrack>
        {showTimeLabels && (
          <div
            className={cn(
              "flex items-center justify-between text-muted-foreground text-xs",
              labelsClassName
            )}
          >
            <ScrubBarTimeLabel time={currentTime} />
            <ScrubBarTimeLabel time={duration - currentTime} />
          </div>
        )}
      </div>
    </ScrubBarContainer>
  );
}

export type { CharacterAlignmentResponseModel, TranscriptSection };
export {
  TranscriptViewerAudio,
  TranscriptViewerContainer,
  TranscriptViewerPlayPauseButton,
  TranscriptViewerProvider,
  TranscriptViewerScrubBar,
  TranscriptViewerWord,
  TranscriptViewerWords,
  useTranscriptViewerContext,
};
