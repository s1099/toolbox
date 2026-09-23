"use client";

import {
  Mic01Icon,
  MicOff01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { cn } from "@/lib/utils";

export interface AudioDevice {
  deviceId: string;
  groupId: string;
  label: string;
}

export interface MicSelectorProps {
  className?: string;
  disabled?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  onValueChange?: (deviceId: string) => void;
  value?: string;
}

export function MicSelector({
  value,
  onValueChange,
  muted,
  onMutedChange,
  disabled,
  className,
}: MicSelectorProps) {
  const { devices, loading, error, hasPermission, loadDevices } =
    useAudioDevices();
  const [selectedDevice, setSelectedDevice] = useState<string>(value || "");
  const [internalMuted, setInternalMuted] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Use controlled muted if provided, otherwise use internal state
  const isMuted = muted === undefined ? internalMuted : muted;

  // Update internal state when controlled value changes
  useEffect(() => {
    if (value !== undefined) {
      setSelectedDevice(value);
    }
  }, [value]);

  // Select first device by default
  const defaultDeviceId = devices[0]?.deviceId || "";
  useEffect(() => {
    if (!selectedDevice && defaultDeviceId) {
      const newDevice = defaultDeviceId;
      setSelectedDevice(newDevice);
      onValueChange?.(newDevice);
    }
  }, [defaultDeviceId, selectedDevice, onValueChange]);

  const currentDevice = devices.find((d) => d.deviceId === selectedDevice) ||
    devices[0] || {
      deviceId: "",
      label: loading ? "Loading..." : "No microphone",
    };

  const handleDeviceSelect = (deviceId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    setSelectedDevice(deviceId);
    onValueChange?.(deviceId);
  };

  const handleDropdownOpenChange = async (open: boolean) => {
    setIsDropdownOpen(open);
    if (open && !hasPermission && !loading) {
      await loadDevices();
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    if (muted === undefined) {
      setInternalMuted(newMuted);
    }
    onMutedChange?.(newMuted);
  };

  const isPreviewActive = isDropdownOpen && !isMuted;

  return (
    <DropdownMenu onOpenChange={handleDropdownOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(
              "flex w-40 min-w-0 shrink cursor-pointer items-center gap-1.5 hover:bg-accent sm:w-48",
              className
            )}
            disabled={loading || disabled}
            size="sm"
            variant="ghost"
          />
        }
      >
        {isMuted ? (
          <HugeiconsIcon
            className="h-4 w-4 flex-shrink-0"
            icon={MicOff01Icon}
            strokeWidth={2}
          />
        ) : (
          <HugeiconsIcon
            className="h-4 w-4 flex-shrink-0"
            icon={Mic01Icon}
            strokeWidth={2}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-xs sm:text-sm">
          {currentDevice.label}
        </span>
        <HugeiconsIcon
          className="h-3 w-3 flex-shrink-0"
          icon={UnfoldMoreIcon}
          strokeWidth={2}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72" side="top">
        {loading ? (
          <DropdownMenuItem disabled>Loading devices...</DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled>Error: {error}</DropdownMenuItem>
        ) : (
          devices.map((device) => (
            <DropdownMenuItem
              className="flex items-center justify-between"
              key={device.deviceId}
              onClick={(e) => handleDeviceSelect(device.deviceId, e)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="truncate">{device.label}</span>
              {selectedDevice === device.deviceId && (
                <HugeiconsIcon
                  className="h-4 w-4 flex-shrink-0"
                  icon={Tick02Icon}
                  strokeWidth={2}
                />
              )}
            </DropdownMenuItem>
          ))
        )}
        {devices.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 p-2">
              <Button
                className="h-8 gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  toggleMute();
                }}
                size="sm"
                variant="ghost"
              >
                {isMuted ? (
                  <HugeiconsIcon
                    className="h-4 w-4"
                    icon={MicOff01Icon}
                    strokeWidth={2}
                  />
                ) : (
                  <HugeiconsIcon
                    className="h-4 w-4"
                    icon={Mic01Icon}
                    strokeWidth={2}
                  />
                )}
                <span className="text-sm">{isMuted ? "Unmute" : "Mute"}</span>
              </Button>
              <div className="ml-auto w-16 overflow-hidden rounded-md bg-accent p-1.5">
                <LiveWaveform
                  active={isPreviewActive}
                  barGap={1}
                  barWidth={3}
                  deviceId={selectedDevice || defaultDeviceId}
                  height={15}
                  mode="static"
                />
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const loadDevicesWithoutPermission = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const deviceList = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = deviceList
        .filter((device) => device.kind === "audioinput")
        .map((device) => {
          let cleanLabel =
            device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
          cleanLabel = cleanLabel.replace(/\s*\([^)]*\)/g, "").trim();

          return {
            deviceId: device.deviceId,
            groupId: device.groupId,
            label: cleanLabel,
          };
        });

      setDevices(audioInputs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get audio devices"
      );
      console.error("Error getting audio devices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDevicesWithPermission = useCallback(async () => {
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      tempStream.getTracks().forEach((track) => track.stop());

      const deviceList = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = deviceList
        .filter((device) => device.kind === "audioinput")
        .map((device) => {
          let cleanLabel =
            device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
          cleanLabel = cleanLabel.replace(/\s*\([^)]*\)/g, "").trim();

          return {
            deviceId: device.deviceId,
            groupId: device.groupId,
            label: cleanLabel,
          };
        });

      setDevices(audioInputs);
      setHasPermission(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get audio devices"
      );
      console.error("Error getting audio devices:", err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    loadDevicesWithoutPermission();
  }, [loadDevicesWithoutPermission]);

  useEffect(() => {
    const handleDeviceChange = () => {
      if (hasPermission) {
        loadDevicesWithPermission();
      } else {
        loadDevicesWithoutPermission();
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, [hasPermission, loadDevicesWithPermission, loadDevicesWithoutPermission]);

  return {
    devices,
    error,
    hasPermission,
    loadDevices: loadDevicesWithPermission,
    loading,
  };
}
