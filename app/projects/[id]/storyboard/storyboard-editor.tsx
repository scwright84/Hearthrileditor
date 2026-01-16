"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  characterStatusForStyle,
  getOmniRefForStyle,
} from "@/lib/characters";
import TimelineEditor from "@/components/audio/timeline-editor";

type TranscriptRow = {
  id: string;
  tSec: number;
  text: string;
};

type ImageCandidate = {
  id: string;
  url?: string | null;
  isSelected: boolean;
  status: "queued" | "running" | "ready" | "error";
  lumaGenerationId?: string | null;
  failureReason?: string | null;
};

type Scene = {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  transcriptSpanText: string;
  focalPoint: string;
  promptText: string;
  status: string;
  imageCandidates: ImageCandidate[];
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


type StyleRef = {
  id: string;
  name?: string | null;
  imageUrl: string;
  weight: number;
};

type StylePack = {
  id: string;
  name: string;
  styleRefs: StyleRef[];
};

type ProjectPayload = {
  id: string;
  title: string;
  createdAt?: string | null;
  stylePresetId?: string | null;
  audioAsset?: AudioAsset | null;
  transcript: TranscriptRow[];
  scenes: Scene[];
  stylePack?: StylePack | null;
  characters?: {
    id: string;
    name: string;
    imageUrls?: unknown;
    omniRefs?: {
      id: string;
      stylePresetId: string;
      status: "pending" | "generating" | "ready" | "error";
      imageUrl?: string | null;
      errorMessage?: string | null;
    }[];
    omniVariants?: {
      id: string;
      stylePresetId: string;
      status: "queued" | "running" | "ready" | "error";
      imageUrl?: string | null;
      isSelected: boolean;
      lumaGenerationId?: string | null;
    }[];
  }[];
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
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

  const allCharactersOmniReady = (current.characters ?? []).every((character) => {
    const status = characterStatusForStyle(character, current.stylePresetId);
    return status === "ready";
  });

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

  const pendingGenerationIds = useMemo(() => {
    const ids: string[] = [];
    current.scenes.forEach((scene) => {
      scene.imageCandidates.forEach((candidate) => {
        if (
          candidate.lumaGenerationId &&
          ["queued", "running"].includes(candidate.status)
        ) {
          ids.push(candidate.lumaGenerationId);
        }
      });
    });
    return ids;
  }, [current.scenes]);

  useEffect(() => {
    if (pendingGenerationIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        pendingGenerationIds.map((id) =>
          fetch(`/api/luma/generations/${id}`).catch(() => null),
        ),
      );
      refreshProject();
    }, 2500);
    return () => clearInterval(interval);
  }, [pendingGenerationIds.join("|"), refreshProject]);

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
                Animation Styles
              </Link>
              <span className="h-4 w-px bg-slate-700" aria-hidden />
              <Link
                href={`/projects/${project.id}/edit`}
                className="text-slate-300 hover:text-white"
              >
                Project Setup
              </Link>
              <Link
                href={`/projects/${project.id}/storyboard`}
                className="text-slate-100 underline underline-offset-4"
              >
                Editor
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
                className="max-w-[220px] text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.2em] file:text-slate-200 hover:file:bg-slate-700"
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
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {!current.audioAsset ? (
              <div className="rounded-xl border border-dashed bg-slate-950/60 p-3 text-sm text-muted-foreground">
                Upload audio in Project Setup to edit it here.
              </div>
              ) : (
                <TimelineEditor
                  audioUrl={current.audioAsset.originalUrl}
                  transcript={current.transcript}
                  initialDuration={current.audioAsset.durationSec ?? null}
                  initialClips={current.audioAsset.waveformData?.clips ?? undefined}
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
                  canTranscribe={!!current.audioAsset}
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
              {current.transcript.length > 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-100">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Transcript
                  </div>
                  <div className="mt-3 grid max-h-[60vh] gap-3 overflow-y-auto pr-2 text-slate-200">
                    {current.transcript.map((row) => (
                      <div
                        key={row.id}
                        className="grid items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                      >
                        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                          {formatTime(row.tSec)}
                        </div>
                        <Textarea
                          value={row.text}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCurrent((prev) => ({
                              ...prev,
                              transcript: prev.transcript.map((item) =>
                                item.id === row.id ? { ...item, text: value } : item,
                              ),
                            }));
                          }}
                          onBlur={async (event) => {
                            await fetch(`/api/transcript/${row.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ text: event.target.value }),
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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

          <div className="flex flex-col gap-6">
            <Card className="w-full max-w-full overflow-hidden border-0 bg-slate-900/80 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Scenes</CardTitle>
                <Button
                  variant="secondary"
                  disabled={!current.stylePresetId || !allCharactersOmniReady}
                  onClick={async () => {
                    setJobNote("Generating scenes...");
                    await fetch(`/api/projects/${project.id}/storyboard`, {
                      method: "POST",
                    });
                    refreshProject();
                  }}
                >
                  Generate Scenes
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {!current.stylePresetId ? (
                  <div className="rounded-xl border border-dashed bg-slate-950/60 p-3 text-sm text-muted-foreground">
                    Pick a style preset to generate scenes.
                  </div>
                ) : null}
                {current.stylePresetId && !allCharactersOmniReady ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Generate omni refs for all characters before generating scenes.
                  </div>
                ) : null}
                <div className="rounded-2xl border bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Character references
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {current.characters?.length ? (
                      current.characters.map((character) => (
                        <Badge key={character.id} variant="secondary">
                          {character.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No character references yet.
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Input
                      placeholder="Add character name"
                      onKeyDown={async (event) => {
                        if (event.key !== "Enter") return;
                        const value = (event.target as HTMLInputElement).value.trim();
                        if (!value) return;
                        await fetch(`/api/projects/${project.id}/characters`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: value }),
                        });
                        (event.target as HTMLInputElement).value = "";
                        refreshProject();
                      }}
                    />
                  </div>
                </div>
                {current.scenes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Generate scenes to continue.
                  </p>
                ) : (
                  current.scenes.map((scene) => (
                    <Card key={scene.id} className="border border-slate-800/60">
                      <CardHeader className="flex flex-row items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            Scene {scene.index + 1}
                          </CardTitle>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {Math.round(scene.startMs / 1000)}s -{" "}
                            {Math.round(scene.endMs / 1000)}s
                          </p>
                        </div>
                        <Badge variant="secondary">{scene.status}</Badge>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {scene.transcriptSpanText}
                        </p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Focal point: {scene.focalPoint}
                        </p>
                        <Textarea
                          value={scene.promptText}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCurrent((prev) => ({
                              ...prev,
                              scenes: prev.scenes.map((item) =>
                                item.id === scene.id
                                  ? { ...item, promptText: value }
                                  : item,
                              ),
                            }));
                          }}
                          onBlur={async (event) => {
                            await fetch(`/api/scenes/${scene.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ promptText: event.target.value }),
                            });
                          }}
                        />
                        {(() => {
                          const character = (current.characters ?? []).find(
                            (item) =>
                              item.name.toLowerCase() ===
                              scene.focalPoint.toLowerCase(),
                          );
                          const omniRef = character
                            ? getOmniRefForStyle(character, current.stylePresetId)
                            : null;
                          const canGenerate =
                            Boolean(current.stylePresetId) &&
                            (!character || omniRef?.status === "ready");
                          return (
                            <div className="space-y-2">
                              {!current.stylePresetId ? (
                                <p className="text-xs text-muted-foreground">
                                  Select a style preset to generate images.
                                </p>
                              ) : null}
                              {character && omniRef?.status !== "ready" ? (
                                <p className="text-xs text-amber-400">
                                  Omni ref required for {character.name}.
                                </p>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  disabled={!canGenerate || scene.status === "generating"}
                                  onClick={async () => {
                                    setJobNote("Generating images...");
                                    await fetch(
                                      `/api/scenes/${scene.id}/generate-images`,
                                      {
                                        method: "POST",
                                      },
                                    );
                                    refreshProject();
                                  }}
                                >
                                  Generate Images
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={!canGenerate || scene.status === "generating"}
                                  onClick={async () => {
                                    setJobNote("Regenerating scene...");
                                    await fetch(`/api/scenes/${scene.id}/regenerate`, {
                                      method: "POST",
                                    });
                                    refreshProject();
                                  }}
                                >
                                  Regenerate Scene
                                </Button>
                              </div>
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="w-full max-w-full overflow-hidden border-0 bg-slate-900/80 shadow-sm">
              <CardHeader>
                <CardTitle>Image Candidates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {current.scenes.map((scene) => (
                  <div key={scene.id} className="space-y-3">
                    <p className="text-sm font-medium text-slate-200">
                      Scene {scene.index + 1}
                    </p>
                    {scene.imageCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Generate images to populate candidates.
                      </p>
                    ) : (
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {scene.imageCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="min-w-[240px] rounded-2xl border bg-slate-950/60 p-4"
                          >
                            {candidate.url ? (
                              <img
                                src={candidate.url}
                                alt="Candidate"
                                className="mb-3 h-40 w-full rounded-xl object-cover"
                              />
                            ) : (
                              <div className="mb-3 flex h-40 w-full items-center justify-center rounded-xl border border-dashed bg-slate-900/70 text-xs uppercase tracking-[0.2em] text-slate-400">
                                {candidate.status === "error"
                                  ? "Failed"
                                  : candidate.status === "running"
                                    ? "Dreaming"
                                    : "Queued"}
                              </div>
                            )}
                            {candidate.failureReason ? (
                              <p className="mb-2 text-xs text-rose-600">
                                {candidate.failureReason}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={candidate.isSelected ? "default" : "secondary"}
                                disabled={candidate.status !== "ready" || !candidate.url}
                                onClick={async () => {
                                  await fetch(
                                    `/api/image-candidates/${candidate.id}/select`,
                                    {
                                      method: "POST",
                                    },
                                  );
                                  refreshProject();
                                }}
                              >
                                {candidate.isSelected ? "Selected" : "Select"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  candidate.status !== "ready" ||
                                  !candidate.url ||
                                  !candidate.isSelected
                                }
                                onClick={async () => {
                                  setJobNote("Animating clip...");
                                  await fetch(
                                    `/api/image-candidates/${candidate.id}/animate`,
                                    {
                                      method: "POST",
                                    },
                                  );
                                  refreshProject();
                                }}
                              >
                                Animate
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}
