"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WaveformEditor from "@/components/audio/waveform-editor";

type TranscriptRow = {
  id: string;
  tSec: number;
  text: string;
};

type ImageCandidate = {
  id: string;
  url: string;
  isSelected: boolean;
};

type AnimationClip = {
  id: string;
  url: string;
  durationSec: number;
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
  animationClips: AnimationClip[];
};

type AudioAsset = {
  id: string;
  originalUrl: string;
  durationSec?: number | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  fadeInSec?: number | null;
  fadeOutSec?: number | null;
};

type StylePreset = {
  id: string;
  name: string;
  suffixTag: string;
};

type ProjectPayload = {
  id: string;
  title: string;
  stylePresetId?: string | null;
  audioAsset?: AudioAsset | null;
  transcript: TranscriptRow[];
  scenes: Scene[];
  characters?: { id: string; name: string }[];
};

export default function ProjectEditor({
  project,
  stylePresets,
}: {
  project: ProjectPayload;
  stylePresets: StylePreset[];
}) {
  const [current, setCurrent] = useState(project);
  const [uploading, setUploading] = useState(false);
  const [jobNote, setJobNote] = useState<string | null>(null);

  const refreshProject = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    if (!response.ok) return;
    const data = await response.json();
    setCurrent(data);
  }, [project.id]);

  useEffect(() => {
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
  }, [project.id, refreshProject]);

  const durationSec = current.audioAsset?.durationSec ?? 0;
  const timelineScale = 16;
  const timelineWidth = Math.max(400, durationSec * timelineScale);

  const sceneBlocks = useMemo(() => {
    return current.scenes.map((scene) => ({
      ...scene,
      left: (scene.startMs / 1000) * timelineScale,
      width: ((scene.endMs - scene.startMs) / 1000) * timelineScale,
    }));
  }, [current.scenes, timelineScale]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#e2e8f0_35%,_#c7d2fe_100%)] px-8 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Project
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              {current.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={current.stylePresetId ?? ""}
              onValueChange={async (value) => {
                const response = await fetch(`/api/projects/${project.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stylePresetId: value }),
                });
                if (response.ok) {
                  const updated = await response.json();
                  setCurrent((prev) => ({ ...prev, stylePresetId: updated.stylePresetId }));
                }
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Style preset" />
              </SelectTrigger>
              <SelectContent>
                {stylePresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              onClick={async () => {
                setJobNote("Rendering preview...");
                await fetch(`/api/projects/${project.id}/export`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "preview" }),
                });
              }}
            >
              Render Preview
            </Button>
            <Button
              onClick={async () => {
                setJobNote("Exporting MP4...");
                await fetch(`/api/projects/${project.id}/export`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "export" }),
                });
              }}
            >
              Export MP4
            </Button>
          </div>
        </header>

        {jobNote ? (
          <div className="rounded-2xl border bg-white/70 px-4 py-3 text-sm text-slate-600">
            {jobNote}
          </div>
        ) : null}

        <Tabs defaultValue="audio" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="audio">
            <Card className="border-0 bg-white/80 shadow-sm">
              <CardHeader>
                <CardTitle>Audio Editor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                  <Input
                    type="file"
                    accept="audio/*"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      const formData = new FormData();
                      formData.append("file", file);
                      const response = await fetch(
                        `/api/projects/${project.id}/audio`,
                        { method: "POST", body: formData },
                      );
                      setUploading(false);
                      if (response.ok) {
                        const data = await response.json();
                        setCurrent((prev) => ({ ...prev, audioAsset: data }));
                      }
                    }}
                  />
                  <Badge variant="secondary">
                    {uploading ? "Uploading..." : "Original audio"}
                  </Badge>
                </div>
                {current.audioAsset ? (
                  <div className="space-y-4">
                    <WaveformEditor
                      audioUrl={current.audioAsset.originalUrl}
                      initialDuration={current.audioAsset.durationSec}
                      trimStartSec={current.audioAsset.trimStartSec}
                      trimEndSec={current.audioAsset.trimEndSec}
                      onTrimChange={async (start, end) => {
                        const response = await fetch(
                          `/api/projects/${project.id}/audio`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              trimStartSec: start,
                              trimEndSec: end,
                              fadeInSec: current.audioAsset?.fadeInSec ?? 0,
                              fadeOutSec: current.audioAsset?.fadeOutSec ?? 0,
                            }),
                          },
                        );
                        if (response.ok) {
                          const data = await response.json();
                          setCurrent((prev) => ({ ...prev, audioAsset: data }));
                        }
                      }}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2 rounded-2xl border bg-white/70 p-4">
                        <p className="text-sm font-medium text-slate-700">
                          Fade in (sec)
                        </p>
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={current.audioAsset.fadeInSec ?? 0}
                          onChange={async (event) => {
                            const value = Number(event.target.value ?? 0);
                            const response = await fetch(
                              `/api/projects/${project.id}/audio`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  trimStartSec: current.audioAsset?.trimStartSec ?? 0,
                                  trimEndSec: current.audioAsset?.trimEndSec ?? 0,
                                  fadeInSec: value,
                                  fadeOutSec: current.audioAsset?.fadeOutSec ?? 0,
                                }),
                              },
                            );
                            if (response.ok) {
                              const data = await response.json();
                              setCurrent((prev) => ({ ...prev, audioAsset: data }));
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2 rounded-2xl border bg-white/70 p-4">
                        <p className="text-sm font-medium text-slate-700">
                          Fade out (sec)
                        </p>
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={current.audioAsset.fadeOutSec ?? 0}
                          onChange={async (event) => {
                            const value = Number(event.target.value ?? 0);
                            const response = await fetch(
                              `/api/projects/${project.id}/audio`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  trimStartSec: current.audioAsset?.trimStartSec ?? 0,
                                  trimEndSec: current.audioAsset?.trimEndSec ?? 0,
                                  fadeInSec: current.audioAsset?.fadeInSec ?? 0,
                                  fadeOutSec: value,
                                }),
                              },
                            );
                            if (response.ok) {
                              const data = await response.json();
                              setCurrent((prev) => ({ ...prev, audioAsset: data }));
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Upload audio to see the waveform and trim controls.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcript">
            <Card className="border-0 bg-white/80 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Transcript (1-second rows)</CardTitle>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setJobNote("Transcribing...");
                    await fetch(`/api/projects/${project.id}/transcribe`, {
                      method: "POST",
                    });
                    refreshProject();
                  }}
                >
                  Transcribe
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {current.transcript.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Run transcription to populate transcript rows.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {current.transcript.map((row) => (
                      <div
                        key={row.id}
                        className="grid items-start gap-3 rounded-xl border bg-white/60 p-3 md:grid-cols-[100px_1fr]"
                      >
                        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                          {new Date(row.tSec * 1000).toISOString().slice(14, 19)}
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="storyboard">
            <Card className="border-0 bg-white/80 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Storyboard Scenes</CardTitle>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setJobNote("Generating storyboard...");
                    await fetch(`/api/projects/${project.id}/storyboard`, {
                      method: "POST",
                    });
                    refreshProject();
                  }}
                >
                  Generate Storyboard
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-white/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
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
                    Generate storyboard scenes to continue.
                  </p>
                ) : (
                  current.scenes.map((scene) => (
                    <Card key={scene.id} className="border border-slate-200/60">
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
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Focal point: {scene.focalPoint}
                        </p>
                        <Textarea
                          value={scene.promptText}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCurrent((prev) => ({
                              ...prev,
                              scenes: prev.scenes.map((item) =>
                                item.id === scene.id ? { ...item, promptText: value } : item,
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              setJobNote("Generating images...");
                              await fetch(`/api/scenes/${scene.id}/generate-images`, {
                                method: "POST",
                              });
                              refreshProject();
                            }}
                          >
                            Generate Images
                          </Button>
                          <Button
                            variant="outline"
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
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="images">
            <div className="grid gap-6">
              {current.scenes.map((scene) => (
                <Card key={scene.id} className="border-0 bg-white/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Scene {scene.index + 1} Candidates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scene.imageCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Generate images to populate candidates.
                      </p>
                    ) : (
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {scene.imageCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="min-w-[260px] rounded-2xl border bg-white/60 p-4"
                          >
                            <img
                              src={candidate.url}
                              alt="Candidate"
                              className="mb-3 h-44 w-full rounded-xl object-cover"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={candidate.isSelected ? "default" : "secondary"}
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            <Card className="border-0 bg-white/80 shadow-sm">
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 overflow-x-auto">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Audio
                  </div>
                  <div
                    className="relative h-10 rounded-lg bg-slate-200"
                    style={{ width: `${timelineWidth}px` }}
                  >
                    <div className="h-full w-full rounded-lg bg-slate-400/60" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Transcript
                  </div>
                  <div
                    className="relative h-10 rounded-lg bg-slate-100"
                    style={{ width: `${timelineWidth}px` }}
                  >
                    {current.transcript.map((row) => (
                      <div
                        key={row.id}
                        className="absolute top-0 h-full rounded bg-slate-200"
                        style={{
                          left: `${row.tSec * timelineScale}px`,
                          width: `${timelineScale}px`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Scenes
                  </div>
                  <div
                    className="relative h-12 rounded-lg bg-slate-100"
                    style={{ width: `${timelineWidth}px` }}
                  >
                    {sceneBlocks.map((scene) => (
                      <div
                        key={scene.id}
                        className="absolute top-1 flex h-10 items-center justify-center rounded bg-indigo-300/70 text-xs font-medium text-slate-900"
                        style={{
                          left: `${scene.left}px`,
                          width: `${Math.max(scene.width, 24)}px`,
                        }}
                      >
                        {scene.index + 1}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Animation Clips
                  </div>
                  <div
                    className="relative h-12 rounded-lg bg-slate-100"
                    style={{ width: `${timelineWidth}px` }}
                  >
                    {current.scenes.flatMap((scene) =>
                      scene.animationClips.map((clip) => (
                        <div
                          key={clip.id}
                          className="absolute top-1 flex h-10 items-center justify-center rounded bg-amber-300/70 text-xs font-medium text-slate-900"
                          style={{
                            left: `${(scene.startMs / 1000) * timelineScale}px`,
                            width: `${clip.durationSec * timelineScale}px`,
                          }}
                        >
                          Clip
                        </div>
                      )),
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
