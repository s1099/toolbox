"use client";

import {
  PauseIcon,
  PlayIcon,
  Settings01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  type ComponentProps,
  createContext,
  type HTMLProps,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { cn } from "@/lib/utils";

enum ReadyState {
  HAVE_NOTHING = 0,
  HAVE_METADATA = 1,
  HAVE_CURRENT_DATA = 2,
  HAVE_FUTURE_DATA = 3,
  HAVE_ENOUGH_DATA = 4,
}

enum NetworkState {
  NETWORK_EMPTY = 0,
  NETWORK_IDLE = 1,
  NETWORK_LOADING = 2,
  NETWORK_NO_SOURCE = 3,
}

function formatTime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedMins = mins < 10 ? `0${mins}` : mins;
  const formattedSecs = secs < 10 ? `0${secs}` : secs;

  return hrs > 0
    ? `${hrs}:${formattedMins}:${formattedSecs}`
    : `${mins}:${formattedSecs}`;
}

interface AudioPlayerItem<TData = unknown> {
  data?: TData;
  id: string | number;
  src: string;
}

interface AudioPlayerApi<TData = unknown> {
  activeItem: AudioPlayerItem<TData> | null;
  duration: number | undefined;
  error: MediaError | null;
  isBuffering: boolean;
  isItemActive: (id: string | number | null) => boolean;
  isPlaying: boolean;
  pause: () => void;
  play: (item?: AudioPlayerItem<TData> | null) => Promise<void>;
  playbackRate: number;
  ref: RefObject<HTMLAudioElement | null>;
  seek: (time: number) => void;
  setActiveItem: (item: AudioPlayerItem<TData> | null) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerApi<unknown> | null>(null);

export function useAudioPlayer<TData = unknown>(): AudioPlayerApi<TData> {
  const api = useContext(AudioPlayerContext) as AudioPlayerApi<TData> | null;
  if (!api) {
    throw new Error(
      "useAudioPlayer cannot be called outside of AudioPlayerProvider"
    );
  }
  return api;
}

const AudioPlayerTimeContext = createContext<number | null>(null);

export const useAudioPlayerTime = () => {
  const time = useContext(AudioPlayerTimeContext);
  if (time === null) {
    throw new Error(
      "useAudioPlayerTime cannot be called outside of AudioPlayerProvider"
    );
  }
  return time;
};

export function AudioPlayerProvider<TData = unknown>({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const itemRef = useRef<AudioPlayerItem<TData> | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const [readyState, setReadyState] = useState<number>(0);
  const [networkState, setNetworkState] = useState<number>(0);
  const [time, setTime] = useState<number>(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [error, setError] = useState<MediaError | null>(null);
  const [activeItem, _setActiveItem] = useState<AudioPlayerItem<TData> | null>(
    null
  );
  const [paused, setPaused] = useState(true);
  const [playbackRate, setPlaybackRateState] = useState<number>(1);

  const setActiveItem = useCallback(
    async (item: AudioPlayerItem<TData> | null) => {
      if (!audioRef.current) {
        return;
      }

      if (item?.id === itemRef.current?.id) {
        return;
      }
      itemRef.current = item;
      const currentRate = audioRef.current.playbackRate;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (item === null) {
        audioRef.current.removeAttribute("src");
      } else {
        audioRef.current.src = item.src;
      }
      audioRef.current.load();
      audioRef.current.playbackRate = currentRate;
    },
    []
  );

  const play = useCallback(
    async (item?: AudioPlayerItem<TData> | null) => {
      if (!audioRef.current) {
        return;
      }

      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current;
        } catch (error) {
          console.error("Play promise error:", error);
        }
      }

      if (item === undefined) {
        const playPromise = audioRef.current.play();
        playPromiseRef.current = playPromise;
        return playPromise;
      }
      if (item?.id === activeItem?.id) {
        const playPromise = audioRef.current.play();
        playPromiseRef.current = playPromise;
        return playPromise;
      }

      itemRef.current = item;
      const currentRate = audioRef.current.playbackRate;
      if (!audioRef.current.paused) {
        audioRef.current.pause();
      }
      audioRef.current.currentTime = 0;
      if (item === null) {
        audioRef.current.removeAttribute("src");
      } else {
        audioRef.current.src = item.src;
      }
      audioRef.current.load();
      audioRef.current.playbackRate = currentRate;
      const playPromise = audioRef.current.play();
      playPromiseRef.current = playPromise;
      return playPromise;
    },
    [activeItem]
  );

  const pause = useCallback(async () => {
    if (!audioRef.current) {
      return;
    }

    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current;
      } catch (e) {
        console.error(e);
      }
    }

    audioRef.current.pause();
    playPromiseRef.current = null;
  }, []);

  const seek = useCallback((time: number) => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = time;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.playbackRate = rate;
    setPlaybackRateState(rate);
  }, []);

  const isItemActive = useCallback(
    (id: string | number | null) => activeItem?.id === id,
    [activeItem]
  );

  useAnimationFrame(() => {
    if (audioRef.current) {
      _setActiveItem(itemRef.current);
      setReadyState(audioRef.current.readyState);
      setNetworkState(audioRef.current.networkState);
      setTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration);
      setPaused(audioRef.current.paused);
      setError(audioRef.current.error);
      setPlaybackRateState(audioRef.current.playbackRate);
    }
  });

  const isPlaying = !paused;
  const isBuffering =
    readyState < ReadyState.HAVE_FUTURE_DATA &&
    networkState === NetworkState.NETWORK_LOADING;

  const api = useMemo<AudioPlayerApi<TData>>(
    () => ({
      activeItem,
      duration,
      error,
      isBuffering,
      isItemActive,
      isPlaying,
      pause,
      play,
      playbackRate,
      ref: audioRef,
      seek,
      setActiveItem,
      setPlaybackRate,
    }),
    [
      audioRef,
      duration,
      error,
      isPlaying,
      isBuffering,
      activeItem,
      playbackRate,
      isItemActive,
      setActiveItem,
      play,
      pause,
      seek,
      setPlaybackRate,
    ]
  );

  return (
    <AudioPlayerContext.Provider value={api as AudioPlayerApi<unknown>}>
      <AudioPlayerTimeContext.Provider value={time}>
        <audio className="hidden" crossOrigin="anonymous" ref={audioRef} />
        {children}
      </AudioPlayerTimeContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

export const AudioPlayerProgress = ({
  ...otherProps
}: Omit<
  ComponentProps<typeof SliderPrimitive.Root>,
  "min" | "max" | "value"
>) => {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const wasPlayingRef = useRef(false);

  return (
    <SliderPrimitive.Root
      {...otherProps}
      className={cn(
        "group/player relative flex h-4 touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[disabled]:opacity-50",
        otherProps.className
      )}
      disabled={
        player.duration === undefined ||
        !Number.isFinite(player.duration) ||
        Number.isNaN(player.duration)
      }
      max={player.duration ?? 0}
      min={0}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          if (player.isPlaying) {
            player.pause();
          } else {
            player.play();
          }
        }
        otherProps.onKeyDown?.(e);
      }}
      onPointerDown={(e) => {
        wasPlayingRef.current = player.isPlaying;
        player.pause();
        otherProps.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        if (wasPlayingRef.current) {
          player.play();
        }
        otherProps.onPointerUp?.(e);
      }}
      onValueChange={(vals) => {
        player.seek(vals[0]);
        otherProps.onValueChange?.(vals);
      }}
      step={otherProps.step || 0.25}
      value={[time]}
    >
      <SliderPrimitive.Track className="relative h-[4px] w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="relative flex h-0 w-0 items-center justify-center opacity-0 focus-visible:opacity-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 group-hover/player:opacity-100"
        data-slot="slider-thumb"
      >
        <div className="absolute size-3 rounded-full bg-foreground" />
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
};

export const AudioPlayerTime = ({
  className,
  ...otherProps
}: HTMLProps<HTMLSpanElement>) => {
  const time = useAudioPlayerTime();
  return (
    <span
      {...otherProps}
      className={cn("text-muted-foreground text-sm tabular-nums", className)}
    >
      {formatTime(time)}
    </span>
  );
};

export const AudioPlayerDuration = ({
  className,
  ...otherProps
}: HTMLProps<HTMLSpanElement>) => {
  const player = useAudioPlayer();
  return (
    <span
      {...otherProps}
      className={cn("text-muted-foreground text-sm tabular-nums", className)}
    >
      {player.duration !== null &&
      player.duration !== undefined &&
      !Number.isNaN(player.duration)
        ? formatTime(player.duration)
        : "--:--"}
    </span>
  );
};

interface SpinnerProps {
  className?: string;
}

function Spinner({ className }: SpinnerProps) {
  return (
    <div
      aria-label="Loading"
      className={cn(
        "size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground",
        className
      )}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface PlayButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean;
  onPlayingChange: (playing: boolean) => void;
  playing: boolean;
}

const PlayButton = ({
  playing,
  onPlayingChange,
  className,
  onClick,
  loading,
  ...otherProps
}: PlayButtonProps) => (
  <Button
    {...otherProps}
    aria-label={playing ? "Pause" : "Play"}
    className={cn("relative", className)}
    onClick={(e) => {
      onPlayingChange(!playing);
      onClick?.(e);
    }}
    type="button"
  >
    {playing ? (
      <HugeiconsIcon
        aria-hidden="true"
        className={cn("size-4", loading && "opacity-0")}
        icon={PauseIcon}
        strokeWidth={2}
      />
    ) : (
      <HugeiconsIcon
        aria-hidden="true"
        className={cn("size-4", loading && "opacity-0")}
        icon={PlayIcon}
        strokeWidth={2}
      />
    )}
    {loading && (
      <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] backdrop-blur-xs">
        <Spinner />
      </div>
    )}
  </Button>
);

export interface AudioPlayerButtonProps<TData = unknown>
  extends React.ComponentProps<typeof Button> {
  item?: AudioPlayerItem<TData>;
}

export function AudioPlayerButton<TData = unknown>({
  item,
  ...otherProps
}: AudioPlayerButtonProps<TData>) {
  const player = useAudioPlayer<TData>();

  if (!item) {
    return (
      <PlayButton
        {...otherProps}
        loading={player.isBuffering && player.isPlaying}
        onPlayingChange={(shouldPlay) => {
          if (shouldPlay) {
            player.play();
          } else {
            player.pause();
          }
        }}
        playing={player.isPlaying}
      />
    );
  }

  return (
    <PlayButton
      {...otherProps}
      loading={
        player.isItemActive(item.id) && player.isBuffering && player.isPlaying
      }
      onPlayingChange={(shouldPlay) => {
        if (shouldPlay) {
          player.play(item);
        } else {
          player.pause();
        }
      }}
      playing={player.isItemActive(item.id) && player.isPlaying}
    />
  );
}

type Callback = (delta: number) => void;

function useAnimationFrame(callback: Callback) {
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const callbackRef = useRef<Callback>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== null) {
        const delta = time - previousTimeRef.current;
        callbackRef.current(delta);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      previousTimeRef.current = null;
    };
  }, []);
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface AudioPlayerSpeedProps
  extends React.ComponentProps<typeof Button> {
  speeds?: readonly number[];
}

export function AudioPlayerSpeed({
  speeds = PLAYBACK_SPEEDS,
  className,
  variant = "ghost",
  size = "icon",
  ...props
}: AudioPlayerSpeedProps) {
  const player = useAudioPlayer();
  const currentSpeed = player.playbackRate;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Playback speed"
            className={cn(className)}
            size={size}
            variant={variant}
            {...props}
          />
        }
      >
        <HugeiconsIcon
          className="size-4"
          icon={Settings01Icon}
          strokeWidth={2}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {speeds.map((speed) => (
          <DropdownMenuItem
            className="flex items-center justify-between"
            key={speed}
            onClick={() => player.setPlaybackRate(speed)}
          >
            <span className={speed === 1 ? "" : "font-mono"}>
              {speed === 1 ? "Normal" : `${speed}x`}
            </span>
            {currentSpeed === speed && (
              <HugeiconsIcon
                className="size-4"
                icon={Tick02Icon}
                strokeWidth={2}
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface AudioPlayerSpeedButtonGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  speeds?: readonly number[];
}

export function AudioPlayerSpeedButtonGroup({
  speeds = [0.5, 1, 1.5, 2],
  className,
  ...props
}: AudioPlayerSpeedButtonGroupProps) {
  const player = useAudioPlayer();
  const currentSpeed = player.playbackRate;

  return (
    <div
      aria-label="Playback speed controls"
      className={cn("flex items-center gap-1", className)}
      role="group"
      {...props}
    >
      {speeds.map((speed) => (
        <Button
          className="min-w-[50px] font-mono text-xs"
          key={speed}
          onClick={() => player.setPlaybackRate(speed)}
          size="sm"
          variant={currentSpeed === speed ? "default" : "outline"}
        >
          {speed}x
        </Button>
      ))}
    </div>
  );
}

export const exampleTracks = [
  {
    id: "0",
    name: "II - 00",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/00.mp3",
  },
  {
    id: "1",
    name: "II - 01",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/01.mp3",
  },
  {
    id: "2",
    name: "II - 02",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/02.mp3",
  },
  {
    id: "3",
    name: "II - 03",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/03.mp3",
  },
  {
    id: "4",
    name: "II - 04",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/04.mp3",
  },
  {
    id: "5",
    name: "II - 05",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/05.mp3",
  },
  {
    id: "6",
    name: "II - 06",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/06.mp3",
  },
  {
    id: "7",
    name: "II - 07",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/07.mp3",
  },
  {
    id: "8",
    name: "II - 08",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/08.mp3",
  },
  {
    id: "9",
    name: "II - 09",
    url: "https://storage.googleapis.com/eleven-public-cdn/audio/ui-elevenlabs-io/09.mp3",
  },
];
