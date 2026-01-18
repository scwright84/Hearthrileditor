"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import TimelineEditor from "@/components/audio/timeline-editor";

type TranscriptRow = {
  id: string;
  tSec: number;
  text: string;
};

type AudioAsset = {
  id: string;
  originalUrl: string;
  durationSec?: number | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  fadeInSec?: number | null;
  fadeOutSec?: number | null;
  waveformData?: {
    clips?: { start: number; end: number }[];
  } | null;
};


type ProjectPayload = {
  id: string;
  title: string;
  createdAt?: string | null;
  audioAsset?: AudioAsset | null;
  transcript: TranscriptRow[];
};

export default function StoryboardEditor({
  project,
}: {
  project: ProjectPayload;
}) {
  const [current, setCurrent] = useState(project);
  const [jobNote, setJobNote] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<{
    message: string;
    correlationId?: string;
  } | null>(null);
  const [fullTranscript, setFullTranscript] = useState("");
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [eventsEnabled, setEventsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("hr_events_enabled") !== "false";
  });

  const formatTimestamp = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  const trimSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshProject = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    if (!response.ok) return;
    const data = await response.json();
    setCurrent(data);
  }, [project.id]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "hr_events_enabled",
        eventsEnabled ? "true" : "false",
      );
    }
  }, [eventsEnabled]);

  useEffect(() => {
    if (!eventsEnabled) return;
    const source = new EventSource(`/api/projects/${project.id}/events`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data?.message) return;
      if (["ping", "connected"].includes(data.message)) return;
      setJobNote(data.message);
      refreshProject();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [eventsEnabled, project.id, refreshProject]);

  const transcriptText = useMemo(() => {
    if (!current.transcript?.length) return "";
    return current.transcript
      .map((row) => `[${formatTimestamp(row.tSec)}] ${row.text}`)
      .join("\n");
  }, [current.transcript]);


  useEffect(() => {
    setFullTranscript(transcriptText);
  }, [transcriptText]);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-6 px-6 py-10">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
              <Link
                href="/projects"
                className="text-slate-300 hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/animation-styles"
                className="text-slate-300 hover:text-white"
              >
                Animation Library
              </Link>
              <span className="h-4 w-px bg-slate-700" aria-hidden />
            <Link
              href={`/projects/${project.id}/edit`}
              className="text-slate-300 hover:text-white"
            >
              Characters & Style
            </Link>
            <Link
              href={`/projects/${project.id}/storyboard`}
              className="text-slate-100 underline underline-offset-4"
            >
              Audio
            </Link>
            <Link
              href={`/projects/${project.id}/storyboard-board`}
              className="text-slate-300 hover:text-white"
            >
              Storyboard
            </Link>
          </nav>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEventsEnabled((prev) => !prev)}
            >
              Live Updates: {eventsEnabled ? "On" : "Off"}
            </Button>
          </div>
          {jobNote ? (
            <div className="mt-3 rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
              {jobNote}
            </div>
          ) : null}
        </header>


        <Card className="w-full max-w-full min-w-0 overflow-hidden border-0 bg-slate-900/80 shadow-sm">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>{current.title}</CardTitle>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Created{" "}
                {current.createdAt
                  ? new Date(current.createdAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept="audio/*"
                className="sr-only"
                ref={audioInputRef}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  const response = await fetch(`/api/projects/${project.id}/audio`, {
                    method: "POST",
                    body: formData,
                  });
                  if (!response.ok) return;
                  const data = await response.json();
                  setCurrent((prev) => ({ ...prev, audioAsset: data }));
                  event.currentTarget.value = "";
                }}
              />
              <Button
                size="sm"
                className="bg-emerald-500 text-white hover:bg-emerald-600"
                onClick={() => {
                  audioInputRef.current?.click();
                }}
              >
                Upload Audio
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {!current.audioAsset ? (
              <div className="rounded-xl border border-dashed bg-slate-950/60 p-3 text-sm text-muted-foreground">
                Upload audio to edit it here.
              </div>
              ) : (
                <TimelineEditor
                  audioUrl={current.audioAsset.originalUrl}
                  initialDuration={current.audioAsset.durationSec ?? null}
                  initialClips={current.audioAsset.waveformData?.clips ?? undefined}
                  onEditedAudio={async ({ blob }) => {
                    const formData = new FormData();
                    const file = new File([blob], "edited.wav", {
                      type: "audio/wav",
                    });
                    formData.append("file", file);
                    const response = await fetch(
                      `/api/projects/${project.id}/audio/edited`,
                      {
                        method: "POST",
                        body: formData,
                      },
                    );
                    if (!response.ok) return;
                    const data = await response.json();
                    setCurrent((prev) => ({ ...prev, audioAsset: data }));
                  }}
                  onTranscribe={async (clips) => {
                    setJobNote("Transcribing...");
                    setTranscribeError(null);
                    setIsTranscribing(true);
                    const response = await fetch(
                      `/api/projects/${project.id}/transcribe`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clips }),
                      },
                    );
                    const payload = await response
                      .json()
                      .catch(() => ({ error: "Invalid server response" }));
                    setIsTranscribing(false);
                    if (!response.ok) {
                      setTranscribeError({
                        message: payload.error ?? "Transcription failed",
                        correlationId: payload.correlationId,
                      });
                      return;
                    }
                    if (payload.rows) {
                      setCurrent((prev) => ({ ...prev, transcript: payload.rows }));
                    }
                    refreshProject();
                  }}
                  canTranscribe={!!current.audioAsset?.editedUrl}
                  isTranscribing={isTranscribing}
                  onSaveClips={(clips) => {
                    setCurrent((prev) => ({
                      ...prev,
                      audioAsset: prev.audioAsset
                        ? {
                            ...prev.audioAsset,
                            waveformData: { clips },
                          }
                        : prev.audioAsset,
                    }));
                    if (trimSaveRef.current) {
                      clearTimeout(trimSaveRef.current);
                    }
                    trimSaveRef.current = setTimeout(async () => {
                      await fetch(`/api/projects/${project.id}/audio`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          trimStartSec: current.audioAsset?.trimStartSec ?? 0,
                          trimEndSec: current.audioAsset?.trimEndSec ?? 0,
                          fadeInSec: current.audioAsset?.fadeInSec ?? 0,
                          fadeOutSec: current.audioAsset?.fadeOutSec ?? 0,
                          waveformData: { clips },
                        }),
                      });
                    }, 400);
                  }}
                />
              )}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-100">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Transcript
                </div>
                {current.transcript.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
                    No transcript yet. Click Transcribe to generate timestamps.
                  </div>
                ) : (
                  <Textarea
                    value={fullTranscript}
                    className="mt-3 min-h-[240px] text-sm text-slate-200"
                    onChange={(event) => setFullTranscript(event.target.value)}
                    onBlur={async () => {
                      if (!current.transcript.length) return;
                      const nextTextMap = new Map<number, string>();
                      fullTranscript
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .forEach((line) => {
                          const match = line.match(
                            /^\\[(\\d{2}):(\\d{2}):(\\d{2})\\]\\s*(.*)$/i,
                          );
                          if (!match) return;
                          const tSec =
                            Number(match[1]) * 3600 +
                            Number(match[2]) * 60 +
                            Number(match[3]);
                          nextTextMap.set(tSec, match[4] ?? "");
                        });
                      const updatedRows = current.transcript.map((row) => ({
                        ...row,
                        text: nextTextMap.get(row.tSec) ?? row.text,
                      }));
                      setCurrent((prev) => ({
                        ...prev,
                        transcript: updatedRows,
                      }));
                      await Promise.all(
                        updatedRows.map((row) =>
                          fetch(`/api/transcript/${row.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: row.text }),
                          }),
                        ),
                      );
                    }}
                  />
                )}
              </div>
              {transcribeError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <div className="font-medium">Transcription failed</div>
                  <div className="text-rose-700">{transcribeError.message}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {transcribeError.correlationId ? (
                      <span className="text-xs uppercase tracking-[0.2em] text-rose-700">
                        ID: {transcribeError.correlationId}
                      </span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const detail = JSON.stringify(transcribeError, null, 2);
                        navigator.clipboard.writeText(detail);
                      }}
                    >
                      Copy debug details
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
