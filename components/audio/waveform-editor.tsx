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

  const sliderValue = useMemo(() => {
    const end = trimEndSec ?? duration;
    return [trimStartSec ?? 0, end];
  }, [trimStartSec, trimEndSec, duration]);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;
    const wave = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#cbd5f5",
      progressColor: "#1f2937",
      height: 96,
      cursorColor: "#0f172a",
    });
    wave.load(audioUrl);
    wave.on("ready", () => {
      setDuration(wave.getDuration());
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
