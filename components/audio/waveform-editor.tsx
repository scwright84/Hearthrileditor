"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type WaveformEditorProps = {
  audioUrl: string;
  initialDuration?: number | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  onTrimChange?: (start: number, end: number) => void;
};

export default function WaveformEditor({
  audioUrl,
  initialDuration,
  trimStartSec,
  trimEndSec,
  onTrimChange,
}: WaveformEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const resolvedAudioUrl = useMemo(() => {
    if (!audioUrl) return "";
    if (typeof window === "undefined") return audioUrl;
    try {
      const sourceUrl = new URL(audioUrl, window.location.origin);
      if (
        sourceUrl.origin !== window.location.origin &&
        sourceUrl.pathname.startsWith("/uploads/")
      ) {
        return `${window.location.origin}${sourceUrl.pathname}`;
      }
      return sourceUrl.toString();
    } catch {
      return audioUrl;
    }
  }, [audioUrl]);

  const sliderValue = useMemo(() => {
    const end = trimEndSec ?? duration;
    return [trimStartSec ?? 0, end];
  }, [trimStartSec, trimEndSec, duration]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!resolvedAudioUrl) {
      setLoadError("Missing audio source.");
      return;
    }
    const wave = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#cbd5f5",
      progressColor: "#1f2937",
      height: 96,
      cursorColor: "#0f172a",
      backend: "MediaElement",
      normalize: true,
      mediaControls: false,
    });
    wave.load(resolvedAudioUrl);
    wave.on("ready", () => {
      setDuration(wave.getDuration());
      setLoadError(null);
    });
    wave.on("error", (error) => {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Audio failed to load.";
      setLoadError(message);
    });
    wave.on("play", () => setIsPlaying(true));
    wave.on("pause", () => setIsPlaying(false));
    waveRef.current = wave;
    return () => {
      wave.destroy();
      waveRef.current = null;
    };
  }, [audioUrl]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white/70 p-4 shadow-sm">
        <div ref={containerRef} />
      </div>
      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <div className="font-medium">Audio failed to load</div>
          <div className="text-rose-700">{loadError}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-rose-700">
            <span className="truncate">Source: {resolvedAudioUrl}</span>
            <a
              href={resolvedAudioUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Open audio
            </a>
          </div>
          <audio controls src={resolvedAudioUrl} className="mt-3 w-full" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => waveRef.current?.playPause()}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Duration {duration.toFixed(1)}s
        </div>
      </div>
      <div className="space-y-2 rounded-2xl border bg-white/70 p-4">
        <div className="text-sm font-medium text-slate-700">
          Trim range
        </div>
        <Slider
          value={sliderValue}
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={0.1}
          onValueChange={(value) => {
            if (!onTrimChange) return;
            onTrimChange(value[0], value[1]);
          }}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>In: {(sliderValue[0] ?? 0).toFixed(1)}s</span>
          <span>Out: {(sliderValue[1] ?? duration).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}
