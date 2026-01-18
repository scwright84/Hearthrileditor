"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";


type ClipRange = {
  start: number;
  end: number;
};

const EPSILON = 0.01;

const audioBufferToWav = (buffer: AudioBuffer) => {
  const numOfChan = buffer.numberOfChannels;
  const bytesPerSample = 4;
  const length = buffer.length * numOfChan * bytesPerSample + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const sampleRate = buffer.sampleRate;
  let offset = 0;

  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
    offset += str.length;
  };

  writeString("RIFF");
  view.setUint32(offset, length - 8, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 3, true);
  offset += 2;
  view.setUint16(offset, numOfChan, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * numOfChan * bytesPerSample, true);
  offset += 4;
  view.setUint16(offset, numOfChan * bytesPerSample, true);
  offset += 2;
  view.setUint16(offset, 32, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, length - offset - 4, true);
  offset += 4;

  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i += 1) {
    channels.push(buffer.getChannelData(i));
  }
  for (let i = 0; i < buffer.length; i += 1) {
    for (let chan = 0; chan < numOfChan; chan += 1) {
      const sample = Math.max(-1, Math.min(1, channels[chan][i]));
      view.setFloat32(offset, sample, true);
      offset += 4;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
};

const getAudioContext = (ref: { current: AudioContext | null }) => {
  if (!ref.current && typeof window !== "undefined") {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (Ctor) {
      ref.current = new Ctor();
    }
  }
  return ref.current;
};

const normalizeClips = (ranges: ClipRange[], duration: number) => {
  if (!duration || !Number.isFinite(duration)) {
    return [];
  }
  if (!ranges.length) {
    return [{ start: 0, end: duration }];
  }
  const cleaned = ranges
    .map((clip) => ({
      start: Math.max(0, Math.min(duration, clip.start)),
      end: Math.max(0, Math.min(duration, clip.end)),
    }))
    .filter((clip) => clip.end - clip.start > EPSILON)
    .sort((a, b) => a.start - b.start);
  if (!cleaned.length) {
    return [{ start: 0, end: duration }];
  }
  return cleaned;
};

type TimelineEditorProps = {
  audioUrl: string;
  initialDuration?: number | null;
  initialClips?: ClipRange[];
  onSaveClips?: (clips: ClipRange[]) => void;
  onTranscribe?: (clips: ClipRange[]) => void;
  onEditedAudio?: (payload: {
    blob: Blob;
    durationSec: number;
    clips: ClipRange[];
  }) => void;
  canTranscribe?: boolean;
  isTranscribing?: boolean;
};

const BASE_PX_PER_SEC = 12;

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

const formatTimeWithMs = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const wholeSecs = Math.floor(seconds % 60);
  const fraction = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${minutes.toString().padStart(2, "0")}:${wholeSecs
    .toString()
    .padStart(2, "0")}.${fraction.toString().padStart(2, "0")}`;
};

export default function TimelineEditor({
  audioUrl,
  initialDuration,
  initialClips,
  onSaveClips,
  onTranscribe,
  onEditedAudio,
  canTranscribe = false,
  isTranscribing = false,
}: TimelineEditorProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const waveformWrapperRef = useRef<HTMLDivElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const editedScrollRef = useRef<HTMLDivElement | null>(null);
  const editedWrapperRef = useRef<HTMLDivElement | null>(null);
  const editedWaveformRef = useRef<HTMLDivElement | null>(null);
  const editedWaveRef = useRef<WaveSurfer | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const decodePromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const buildIdRef = useRef(0);
  const editedBlobUrlRef = useRef<string | null>(null);
  const editedUploadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedSignatureRef = useRef<string | null>(null);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editedDuration, setEditedDuration] = useState(0);
  const [editedTime, setEditedTime] = useState(0);
  const [editedIsPlaying, setEditedIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [waveWidth, setWaveWidth] = useState(0);
  const [pxPerSecActual, setPxPerSecActual] = useState(BASE_PX_PER_SEC * zoom);
  const [editedWaveWidth, setEditedWaveWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(900);
  const [clips, setClips] = useState<ClipRange[]>(initialClips ?? []);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<ClipRange[][]>([]);
  const isUndoingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const clipsRef = useRef<ClipRange[]>([]);
  const pxPerSecRef = useRef(BASE_PX_PER_SEC * zoom);

  const basePxPerSec = Math.max(6, containerWidth / 30);
  const pxPerSec = basePxPerSec * zoom;
  const timelineTotalSec = duration;
  const timelineTotalWidth = Math.max(1, waveWidth || duration * pxPerSec);
  const visualPxPerSec =
    duration > 0 ? timelineTotalWidth / duration : pxPerSec;
  const editedTimelineTotalWidth = Math.max(
    1,
    editedWaveWidth || editedDuration * pxPerSec,
  );
  const editedPxPerSec = editedDuration
    ? editedTimelineTotalWidth / editedDuration
    : pxPerSec;
  const displayClips = useMemo(
    () => normalizeClips(clips, duration),
    [clips, duration],
  );
  const clipGaps = useMemo(() => {
    if (!duration || displayClips.length === 0) return [];
    const gaps: ClipRange[] = [];
    const sorted = [...displayClips].sort((a, b) => a.start - b.start);
    if (sorted[0].start > 0) {
      gaps.push({ start: 0, end: sorted[0].start });
    }
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const gapStart = sorted[i].end;
      const gapEnd = sorted[i + 1].start;
      if (gapEnd - gapStart > EPSILON) {
        gaps.push({ start: gapStart, end: gapEnd });
      }
    }
    if (sorted[sorted.length - 1].end < duration) {
      gaps.push({ start: sorted[sorted.length - 1].end, end: duration });
    }
    return gaps;
  }, [displayClips, duration]);

  useEffect(() => {
    pxPerSecRef.current = pxPerSec;
  }, [pxPerSec]);

  useEffect(() => {
    if (waveRef.current) {
      waveRef.current.setPlaybackRate(playbackRate);
    }
    if (editedWaveRef.current) {
      editedWaveRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  useEffect(() => {
    clipsRef.current = displayClips;
  }, [displayClips]);

  useEffect(() => {
    const updateWidth = () => {
      const width = scrollRef.current?.clientWidth;
      if (width && width > 0) {
        setContainerWidth(width);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);
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

  const ensureDecodedBuffer = async () => {
    if (decodedBufferRef.current) {
      return decodedBufferRef.current;
    }
    if (decodePromiseRef.current) {
      return decodePromiseRef.current;
    }
    const ctx = getAudioContext(audioContextRef);
    if (!ctx || !resolvedAudioUrl) return null;
    decodePromiseRef.current = (async () => {
      try {
        const response = await fetch(resolvedAudioUrl);
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(data);
        decodedBufferRef.current = decoded;
        return decoded;
      } catch {
        return null;
      } finally {
        decodePromiseRef.current = null;
      }
    })();
    return decodePromiseRef.current;
  };

  useEffect(() => {
    const ctx = getAudioContext(audioContextRef);
    if (!resolvedAudioUrl || !ctx) return;
    const controller = new AbortController();
    const buildId = ++buildIdRef.current;
    const load = async () => {
      try {
        const response = await fetch(resolvedAudioUrl, {
          signal: controller.signal,
        });
        const data = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(data);
        if (buildId !== buildIdRef.current) return;
        decodedBufferRef.current = decoded;
      } catch {
        // Ignore decode failures; editor will still function for original audio.
      }
    };
    load();
    return () => {
      controller.abort();
    };
  }, [resolvedAudioUrl]);

  useEffect(() => {
    if (!waveformRef.current || !resolvedAudioUrl) return;
    const wave = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#cbd5f5",
      progressColor: "#38bdf8",
      cursorColor: "transparent",
      cursorWidth: 0,
      height: 110,
      backend: "MediaElement",
      minPxPerSec: pxPerSecRef.current,
      fillParent: false,
      normalize: false,
      interact: true,
      hideScrollbar: true,
      dragToSeek: true,
    });
    wave.load(resolvedAudioUrl);
    wave.on("ready", () => {
      const nextDuration = wave.getDuration();
      setDuration(nextDuration);
      setClips((prev) => normalizeClips(prev, nextDuration));
      const decoded = wave.getDecodedData?.();
      if (decoded && !decodedBufferRef.current) {
        decodedBufferRef.current = decoded;
      }
      wave.zoom(pxPerSecRef.current);
      const wrapper = wave.getWrapper?.();
      if (wrapper) {
        const width = wrapper.scrollWidth;
        setWaveWidth(width);
        if (nextDuration > 0) {
          setPxPerSecActual(width / nextDuration);
        }
      }
    });
    const skipIfNeeded = (time: number) => {
      if (isSeekingRef.current || clipsRef.current.length === 0) return;
      const active = clipsRef.current.find(
        (clip) => time >= clip.start && time <= clip.end,
      );
      if (active) return;
      const next = clipsRef.current.find((clip) => clip.start > time);
      const target = next?.start ?? clipsRef.current.at(-1)?.end ?? time;
      if (next || target !== time) {
        isSeekingRef.current = true;
        wave.setTime(target);
        setCurrentTime(target);
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 0);
      } else if (!next) {
        wave.pause();
      }
    };
    wave.on("audioprocess", (time) => {
      setCurrentTime(time);
      skipIfNeeded(time);
    });
    wave.on("timeupdate", (time) => {
      setCurrentTime(time);
      skipIfNeeded(time);
    });
    wave.on("play", () => setIsPlaying(true));
    wave.on("pause", () => {
      setIsPlaying(false);
      setSelectedTime(wave.getCurrentTime());
    });
    waveRef.current = wave;
    return () => {
      wave.destroy();
      waveRef.current = null;
    };
  }, [resolvedAudioUrl]);

  useEffect(() => {
    if (!editedWaveformRef.current) return;
    if (editedWaveRef.current) return;
    const wave = WaveSurfer.create({
      container: editedWaveformRef.current,
      waveColor: "#a5b4fc",
      progressColor: "#38bdf8",
      cursorColor: "transparent",
      cursorWidth: 0,
      height: 90,
      backend: "MediaElement",
      minPxPerSec: pxPerSecRef.current,
      fillParent: false,
      normalize: false,
      interact: true,
      hideScrollbar: true,
      dragToSeek: true,
    });
    wave.on("play", () => setEditedIsPlaying(true));
    wave.on("pause", () => {
      setEditedIsPlaying(false);
      setEditedTime(wave.getCurrentTime());
    });
    wave.on("timeupdate", (time) => setEditedTime(time));
    editedWaveRef.current = wave;
    return () => {
      wave.destroy();
      editedWaveRef.current = null;
      if (editedBlobUrlRef.current) {
        URL.revokeObjectURL(editedBlobUrlRef.current);
        editedBlobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const wave = editedWaveRef.current;
      if (!wave || !displayClips.length) return;
      const buildId = ++buildIdRef.current;
      const nextClips = [...displayClips].sort((a, b) => a.start - b.start);
      const isFullClip =
        nextClips.length === 1 &&
        Math.abs(nextClips[0].start) <= EPSILON &&
        Math.abs(nextClips[0].end - duration) <= EPSILON;
      const signature = `${isFullClip ? "full" : "cut"}:${duration}:${nextClips
        .map((clip) => `${clip.start.toFixed(2)}-${clip.end.toFixed(2)}`)
        .join("|")}`;
      if (editedSignatureRef.current === signature) {
        return;
      }
      editedSignatureRef.current = signature;
      if (isFullClip && resolvedAudioUrl) {
        setEditedDuration(duration);
        if (editedBlobUrlRef.current) {
          URL.revokeObjectURL(editedBlobUrlRef.current);
          editedBlobUrlRef.current = null;
        }
        wave.load(resolvedAudioUrl);
        if (onEditedAudio) {
          if (editedUploadRef.current) {
            clearTimeout(editedUploadRef.current);
          }
          editedUploadRef.current = setTimeout(async () => {
            try {
              const response = await fetch(resolvedAudioUrl);
              if (!response.ok) return;
              const blob = await response.blob();
              onEditedAudio({
                blob,
                durationSec: duration,
                clips: nextClips,
              });
            } catch {
              // Ignore upload failures.
            }
          }, 500);
        }
        wave.once("ready", () => {
          wave.zoom(pxPerSecRef.current);
          const wrapper = wave.getWrapper?.();
          if (wrapper) {
            setEditedWaveWidth(wrapper.scrollWidth);
          }
        });
        return;
      }
      const buffer = await ensureDecodedBuffer();
      if (!buffer || cancelled) return;
      const ctx = getAudioContext(audioContextRef);
      if (!ctx) return;
      const totalDuration = nextClips.reduce(
        (sum, clip) => sum + (clip.end - clip.start),
        0,
      );
      if (totalDuration <= 0) return;
      const sampleRate = buffer.sampleRate;
      const totalSamples = Math.max(1, Math.floor(totalDuration * sampleRate));
      const editedBuffer = ctx.createBuffer(
        buffer.numberOfChannels,
        totalSamples,
        sampleRate,
      );
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const source = buffer.getChannelData(channel);
        const target = editedBuffer.getChannelData(channel);
        let offset = 0;
        nextClips.forEach((clip) => {
          const start = Math.floor(clip.start * sampleRate);
          const end = Math.floor(clip.end * sampleRate);
          if (end <= start) return;
          const slice = source.subarray(start, end);
          target.set(slice, offset);
          offset += slice.length;
        });
      }
      if (buildId !== buildIdRef.current || cancelled) return;
      setEditedDuration(totalSamples / sampleRate);
      const blob = audioBufferToWav(editedBuffer);
      if (editedBlobUrlRef.current) {
        URL.revokeObjectURL(editedBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      editedBlobUrlRef.current = blobUrl;
      wave.load(blobUrl);
      if (onEditedAudio) {
        if (editedUploadRef.current) {
          clearTimeout(editedUploadRef.current);
        }
        editedUploadRef.current = setTimeout(() => {
          onEditedAudio({
            blob,
            durationSec: totalSamples / sampleRate,
            clips: nextClips,
          });
        }, 500);
      }
      wave.once("ready", () => {
        wave.zoom(pxPerSecRef.current);
        const wrapper = wave.getWrapper?.();
        if (wrapper) {
          setEditedWaveWidth(wrapper.scrollWidth);
        }
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [displayClips, resolvedAudioUrl, duration]);

  useEffect(() => {
    const wave = editedWaveRef.current;
    if (!wave) return;
    if (!editedDuration) return;
    try {
      wave.zoom(pxPerSec);
      const wrapper = wave.getWrapper?.();
      if (wrapper) {
        setEditedWaveWidth(wrapper.scrollWidth);
      }
    } catch {
      // Ignore until audio is ready.
    }
  }, [pxPerSec, editedDuration]);

  useEffect(() => {
    if (!waveRef.current) return;
    const durationSec = waveRef.current.getDuration?.() ?? 0;
    if (!durationSec) return;
    try {
      waveRef.current.zoom(pxPerSec);
      const wrapper = waveRef.current.getWrapper?.();
      if (wrapper) {
        const width = wrapper.scrollWidth;
        setWaveWidth(width);
        setPxPerSecActual(width / durationSec);
      }
    } catch {
      // Ignore if audio is not ready yet.
    }
  }, [pxPerSec]);

  const applyClipUpdate = (nextClips: ClipRange[]) => {
    if (!isUndoingRef.current) {
      setHistory((prev) => [...prev, displayClips]);
    }
    setClips(nextClips);
    if (onSaveClips) {
      onSaveClips(nextClips);
    }
  };

  const splitAtPlayhead = () => {
    const time = selectedTime ?? currentTime;
    if (!duration) return;
    const workingClips = displayClips.length
      ? displayClips
      : [{ start: 0, end: duration }];
    const idx = workingClips.findIndex(
      (clip) => time >= clip.start && time <= clip.end,
    );
    if (idx < 0) return;
    const clip = workingClips[idx];
    const splitTime = Math.min(
      clip.end - EPSILON,
      Math.max(clip.start + EPSILON, time),
    );
    if (splitTime <= clip.start || splitTime >= clip.end) return;
    const nextClips = [
      ...workingClips.slice(0, idx),
      { start: clip.start, end: splitTime },
      { start: splitTime, end: clip.end },
      ...workingClips.slice(idx + 1),
    ];
    applyClipUpdate(nextClips);
    setActiveClipIndex(idx + 1);
    if (waveRef.current) {
      waveRef.current.setTime(splitTime);
      setCurrentTime(splitTime);
    }
    setSelectedTime(splitTime);
  };

  const deleteActiveClip = () => {
    let targetIndex = activeClipIndex;
    if (targetIndex == null && selectedTime != null) {
      const idx = displayClips.findIndex(
        (clip) => selectedTime >= clip.start && selectedTime <= clip.end,
      );
      if (idx >= 0) {
        targetIndex = idx;
      }
    }
    if (targetIndex == null) return;
    const nextClips = displayClips.filter((_clip, idx) => idx !== targetIndex);
    applyClipUpdate(nextClips);
    setActiveClipIndex(null);
    if (waveRef.current) {
      const fallback = nextClips[targetIndex] ? nextClips[targetIndex].start : 0;
      waveRef.current.setTime(fallback);
      setCurrentTime(fallback);
      setSelectedTime(fallback);
    }
  };

  const undoLast = () => {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      isUndoingRef.current = true;
      setClips(last);
      if (onSaveClips) {
        onSaveClips(last);
      }
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
      return prev.slice(0, -1);
    });
  };

  const playFromSelected = () => {
    const wave = waveRef.current;
    if (!wave) return;
    const time = selectedTime ?? currentTime;
    if (Number.isFinite(time)) {
      wave.setTime(time);
      setCurrentTime(time);
    }
    wave.play();
  };

  const pauseAtCurrent = () => {
    const wave = waveRef.current;
    if (!wave) return;
    wave.pause();
    const time = wave.getCurrentTime?.() ?? currentTime;
    setCurrentTime(time);
    setSelectedTime(time);
  };

  const playEditedFromSelected = () => {
    const wave = editedWaveRef.current;
    if (!wave) return;
    const time = editedTime;
    if (Number.isFinite(time)) {
      wave.setTime(time);
      setEditedTime(time);
    }
    wave.play();
  };

  const pauseEditedAtCurrent = () => {
    const wave = editedWaveRef.current;
    if (!wave) return;
    wave.pause();
    const time = wave.getCurrentTime?.() ?? editedTime;
    setEditedTime(time);
  };

  const clearSplits = () => {
    if (!duration) return;
    applyClipUpdate([{ start: 0, end: duration }]);
    setActiveClipIndex(null);
    setSelectedTime(null);
    if (waveRef.current) {
      waveRef.current.setTime(0);
      setCurrentTime(0);
    }
  };

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        activeClipIndex != null
      ) {
        event.preventDefault();
        deleteActiveClip();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLast();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [activeClipIndex, clips]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Button
            variant="secondary"
            onClick={isPlaying ? pauseAtCurrent : playFromSelected}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <span className="font-mono text-xs">
            {formatTimeWithMs(currentTime)} / {formatTimeWithMs(duration)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span>Zoom</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setZoom((prev) => Math.max(0.2, prev - 0.1))}
            >
              -
            </Button>
            <span className="min-w-[48px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setZoom((prev) => Math.min(4, prev + 0.1))}
            >
              +
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span>Speed</span>
          <div className="flex items-center gap-2">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <Button
                key={rate}
                size="sm"
                variant={playbackRate === rate ? "secondary" : "outline"}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={splitAtPlayhead}>
            Split
          </Button>
          <Button variant="outline" onClick={deleteActiveClip}>
            Cut
          </Button>
          <Button variant="outline" onClick={clearSplits}>
            Clear Splits
          </Button>
          <Button variant="outline" onClick={undoLast} disabled={history.length === 0}>
            Undo
          </Button>
          <span className="text-xs text-slate-400">
            Splits: {Math.max(0, displayClips.length - 1)}
          </span>
          <span className="text-xs text-slate-500">
            Selected: {selectedTime != null ? formatTime(selectedTime) : "—"}
          </span>
          <span className="text-xs text-slate-600">
            Clips: {displayClips.length} · Dur: {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Timeline
        </div>
        <div
          ref={scrollRef}
          className="mt-4 w-full max-w-full overflow-x-auto"
        >
          <div
            className="relative min-h-[190px] max-w-full"
            style={{ width: timelineTotalWidth }}
          >
            <div className="absolute left-0 top-0 h-full w-full">
              <div className="relative h-8 text-xs text-slate-400">
                {Array.from(
                  { length: Math.ceil(timelineTotalSec / 5) + 1 },
                  (_, idx) => idx * 5,
                ).map((sec) => (
                  <div
                    key={sec}
                    className="absolute"
                    style={{ left: sec * visualPxPerSec }}
                  >
                    {formatTime(sec)}
                  </div>
                ))}
              </div>
              
              <div
                ref={waveformWrapperRef}
                className="relative mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-0 py-2"
                style={{ width: timelineTotalWidth }}
              >
                <div
                  ref={waveformRef}
                  className="pointer-events-none"
                  style={{ width: timelineTotalWidth }}
                />
                <div
                  className="absolute inset-0 z-10 cursor-crosshair bg-transparent"
                  role="presentation"
                  onPointerDown={(event) => {
                    const container = waveformWrapperRef.current;
                    if (!container || !duration) return;
                    const bounds = container.getBoundingClientRect();
                    const offsetX = event.clientX - bounds.left;
                    const nextTime = Math.max(
                      0,
                      Math.min(duration, (offsetX / timelineTotalWidth) * duration),
                    );
                    waveRef.current?.setTime(nextTime);
                    setCurrentTime(nextTime);
                    setSelectedTime(nextTime);
                    const idx = displayClips.findIndex(
                      (clip) => nextTime >= clip.start && nextTime <= clip.end,
                    );
                    setActiveClipIndex(idx >= 0 ? idx : null);
                  }}
                />
                {clipGaps.map((gap, idx) => (
                  <div
                    key={`gap-${gap.start}-${gap.end}-${idx}`}
                    className="pointer-events-none absolute inset-y-0 z-10 bg-slate-950/50"
                    style={{
                      left: gap.start * visualPxPerSec,
                      width: (gap.end - gap.start) * visualPxPerSec,
                    }}
                  />
                ))}
                {displayClips.map((clip, idx) => (
                  <div
                    key={`${clip.start}-${clip.end}-${idx}`}
                    className={`pointer-events-none absolute inset-y-0 z-20 rounded-lg border ${
                      idx === activeClipIndex
                        ? "border-orange-400/80 bg-orange-500/10"
                        : "border-transparent bg-transparent"
                    }`}
                    style={{
                      left: clip.start * visualPxPerSec,
                      width: (clip.end - clip.start) * visualPxPerSec,
                    }}
                  />
                ))}
                {displayClips.slice(1).map((clip) => (
                  <div
                    key={`split-${clip.start}`}
                    className="pointer-events-none absolute inset-y-0 z-30 w-[2px] bg-red-500"
                    style={{ left: clip.start * visualPxPerSec }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-y-0 z-40 w-[2px] bg-orange-400/80"
                  style={{
                    left:
                      (isPlaying ? currentTime : selectedTime ?? currentTime) *
                      visualPxPerSec,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Edited Timeline (Preview)
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            {onTranscribe ? (
              <Button
                variant="secondary"
                disabled={!canTranscribe || isTranscribing}
                onClick={() => onTranscribe(displayClips)}
              >
                {isTranscribing ? "Transcribing..." : "Transcribe"}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={editedIsPlaying ? pauseEditedAtCurrent : playEditedFromSelected}
              disabled={!editedDuration}
            >
              {editedIsPlaying ? "Pause" : "Play"}
            </Button>
            <span className="font-mono text-xs">
              {formatTimeWithMs(editedTime)} / {formatTimeWithMs(editedDuration)}
            </span>
          </div>
        </div>
        <div
          ref={editedScrollRef}
          className="mt-4 w-full max-w-full overflow-x-auto"
        >
          <div
            className="relative min-h-[160px] max-w-full"
            style={{ width: editedTimelineTotalWidth }}
          >
            <div className="absolute left-0 top-0 h-full w-full">
              <div className="relative h-8 text-xs text-slate-400">
                {Array.from(
                  { length: Math.ceil(editedDuration / 5) + 1 },
                  (_, idx) => idx * 5,
                ).map((sec) => (
                  <div
                    key={`edited-${sec}`}
                    className="absolute"
                    style={{ left: sec * editedPxPerSec }}
                  >
                    {formatTime(sec)}
                  </div>
                ))}
              </div>
              <div
                ref={editedWrapperRef}
                className="relative mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-0 py-2"
                style={{ width: editedTimelineTotalWidth }}
              >
                <div
                  ref={editedWaveformRef}
                  className="pointer-events-none"
                  style={{ width: editedTimelineTotalWidth }}
                />
                <div
                  className="absolute inset-0 z-10 cursor-crosshair bg-transparent"
                  role="presentation"
                  onPointerDown={(event) => {
                    const container = editedWrapperRef.current;
                    if (!container || !editedDuration) return;
                    const bounds = container.getBoundingClientRect();
                    const offsetX = event.clientX - bounds.left;
                    const nextTime = Math.max(
                      0,
                      Math.min(
                        editedDuration,
                        (offsetX / editedTimelineTotalWidth) * editedDuration,
                      ),
                    );
                    editedWaveRef.current?.setTime(nextTime);
                    setEditedTime(nextTime);
                  }}
                />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 z-40 w-[2px] bg-emerald-400/80"
                style={{
                  left: editedTime * editedPxPerSec,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
