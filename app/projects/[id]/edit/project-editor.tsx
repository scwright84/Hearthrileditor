"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  characterStatusForStyle,
  getCharacterHeadshotUrl,
  getOmniRefForStyle,
} from "@/lib/characters";

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

type AnimationClip = {
  id: string;
  url?: string | null;
  durationSec?: number | null;
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
  stylePresetId?: string | null;
  audioAsset?: AudioAsset | null;
  transcript: TranscriptRow[];
  scenes: Scene[];
  stylePack?: StylePack | null;
  characters?: {
    id: string;
    name: string;
    imageUrls?: unknown;
    descriptionPrompt?: string | null;
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
      index?: number | null;
      status: "queued" | "running" | "ready" | "error";
      imageUrl?: string | null;
      isSelected: boolean;
      lumaGenerationId?: string | null;
      failureReason?: string | null;
    }[];
  }[];
};

export default function ProjectEditor({
  project,
  stylePresets,
}: {
  project: ProjectPayload;
  stylePresets: StylePreset[];
}) {
  const [current, setCurrent] = useState(project);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.title);
  const [globalStylePacks, setGlobalStylePacks] = useState<StylePack[]>([]);
  const [uploading, setUploading] = useState(false);
  const [jobNote, setJobNote] = useState<string | null>(null);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [characterModalId, setCharacterModalId] = useState<string | null>(null);
  const [characterModalName, setCharacterModalName] = useState("");
  const [characterModalFile, setCharacterModalFile] = useState<File | null>(null);
  const [characterModalError, setCharacterModalError] = useState<string | null>(
    null,
  );
  const [characterModalSaving, setCharacterModalSaving] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null,
  );
  const [editingCharacterName, setEditingCharacterName] = useState("");
  const [promptLoadingId, setPromptLoadingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [omniProgress, setOmniProgress] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const characterRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  useEffect(() => {
    const loadGlobal = async () => {
      const response = await fetch("/api/style-packs/global");
      if (!response.ok) return;
      const data = await response.json();
      setGlobalStylePacks(Array.isArray(data) ? data : []);
    };
    loadGlobal();
  }, []);

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
      scene.animationClips.forEach((clip) => {
        if (clip.lumaGenerationId && ["queued", "running"].includes(clip.status)) {
          ids.push(clip.lumaGenerationId);
        }
      });
    });
    return ids;
  }, [current.characters, current.scenes]);

  const pendingOmniVariantIds = useMemo(() => {
    const ids: string[] = [];
    (current.characters ?? []).forEach((character) => {
      (character.omniVariants ?? []).forEach((variant) => {
        if (["queued", "running"].includes(variant.status)) {
          ids.push(variant.id);
        }
      });
    });
    return ids;
  }, [current.characters]);

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

  useEffect(() => {
    if (pendingOmniVariantIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        pendingOmniVariantIds.map((id) =>
          fetch(`/api/omni/variants/${id}/status`).catch(() => null),
        ),
      );
      refreshProject();
    }, 2500);
    return () => clearInterval(interval);
  }, [pendingOmniVariantIds.join("|"), refreshProject]);

  const durationSec = current.audioAsset?.durationSec ?? 0;
  const timelineScale = 16;
  const timelineWidth = Math.max(400, durationSec * timelineScale);
  const allScenesSelected =
    current.scenes.length > 0 &&
    current.scenes.every(
      (scene) =>
        scene.imageCandidates.length > 0 &&
        scene.imageCandidates.some(
          (candidate) =>
            candidate.isSelected && candidate.status === "ready" && candidate.url,
        ),
    );
  const allCharactersOmniReady = (current.characters ?? []).every((character) => {
    const status = characterStatusForStyle(character, current.stylePresetId);
    return status === "ready";
  });

  const sceneBlocks = useMemo(() => {
    return current.scenes.map((scene) => {
      const selected =
        scene.imageCandidates.find(
          (item) => item.isSelected && item.status === "ready" && item.url,
        ) ??
        scene.imageCandidates.find(
          (item) => item.status === "ready" && item.url,
        ) ??
        scene.imageCandidates[0];
      return {
        ...scene,
        imageUrl: selected?.url ?? null,
        left: (scene.startMs / 1000) * timelineScale,
        width: ((scene.endMs - scene.startMs) / 1000) * timelineScale,
      };
    });
  }, [current.scenes, timelineScale]);

  const displayAssetUrl = (url?: string | null) => {
    if (!url) return null;
    if (!url.startsWith("http")) return url;
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname.endsWith("ngrok-free.dev") ||
        parsed.hostname.endsWith("ngrok-free.app")
      ) {
        return parsed.pathname;
      }
    } catch {
      return url;
    }
    return url;
  };

  const openCharacterModal = (character?: { id: string; name: string }) => {
    setCharacterModalId(character?.id ?? null);
    setCharacterModalName(character?.name ?? "");
    setCharacterModalFile(null);
    setCharacterModalError(null);
    setCharacterModalOpen(true);
  };

  const saveCharacterName = async (characterId: string, rawName: string) => {
    const value = rawName.trim();
    if (!value) return;
    const response = await fetch(`/api/characters/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.name) {
        setCurrent((prev) => ({
          ...prev,
          characters: (prev.characters ?? []).map((item) =>
            item.id === characterId ? { ...item, name: data.name } : item,
          ),
        }));
      }
    }
  };

  const saveCharacterPrompt = async (
    characterId: string,
    rawPrompt: string,
  ) => {
    const value = rawPrompt.trim();
    const response = await fetch(`/api/characters/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptionPrompt: value }),
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.descriptionPrompt !== undefined) {
        setCurrent((prev) => ({
          ...prev,
          characters: (prev.characters ?? []).map((item) =>
            item.id === characterId
              ? { ...item, descriptionPrompt: data.descriptionPrompt }
              : item,
          ),
        }));
      }
    }
  };

  const generateCharacterPrompt = async (characterId: string) => {
    setPromptLoadingId(characterId);
    const response = await fetch(`/api/characters/${characterId}/describe`, {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.descriptionPrompt !== undefined) {
        setCurrent((prev) => ({
          ...prev,
          characters: (prev.characters ?? []).map((item) =>
            item.id === characterId
              ? { ...item, descriptionPrompt: data.descriptionPrompt }
              : item,
          ),
        }));
      }
    }
    setPromptLoadingId(null);
  };

  const handleSaveCharacter = async () => {
    if (!characterModalFile) {
      setCharacterModalError("Select a photo to continue.");
      return;
    }
    if (characterModalSaving) return;
    setCharacterModalSaving(true);
    setCharacterModalError(null);

    let targetId = characterModalId;
    try {
      if (!targetId) {
        const fallbackName = `Character ${(current.characters ?? []).length + 1}`;
        const response = await fetch(`/api/projects/${project.id}/characters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fallbackName }),
        });
        if (!response.ok) {
          setCharacterModalError("Failed to create character.");
          return;
        }
        const data = await response.json().catch(() => null);
        if (!data?.id) {
          setCharacterModalError("Failed to create character.");
          return;
        }
        targetId = data.id;
      }

      const formData = new FormData();
      formData.append("file", characterModalFile);
      await fetch(`/api/characters/${targetId}/headshot`, {
        method: "POST",
        body: formData,
      });

      await refreshProject();
      setCharacterModalOpen(false);
      setCharacterModalId(null);
      setCharacterModalName("");
      setCharacterModalFile(null);
      setCharacterModalError(null);
    } finally {
      setCharacterModalSaving(false);
    }
  };

  const previewScenes = useMemo(() => {
    return current.scenes.map((scene) => {
      const selected =
        scene.imageCandidates.find(
          (item) => item.isSelected && item.status === "ready" && item.url,
        ) ??
        scene.imageCandidates.find(
          (item) => item.status === "ready" && item.url,
        ) ??
        scene.imageCandidates[0];
      const readyClip = [...scene.animationClips]
        .reverse()
        .find((clip) => clip.status === "ready" && clip.url);
      return {
        id: scene.id,
        index: scene.index,
        startSec: scene.startMs / 1000,
        endSec: scene.endMs / 1000,
        durationSec: Math.max(0.1, (scene.endMs - scene.startMs) / 1000),
        imageUrl: selected?.url ?? null,
        clipUrl: readyClip?.url ?? null,
      };
    });
  }, [current.scenes]);

  const totalDuration = previewScenes.reduce(
    (sum, scene) => sum + scene.durationSec,
    0,
  );

  const statusLabel = (status: string) => {
    if (status === "ready") return "Ready";
    if (status === "generating") return "Generating...";
    if (status === "error") return "Error";
    if (status === "missing-headshot") return "Needs Headshot";
    if (status === "needs-style") return "Pick Style";
    return "Needs Omni";
  };

  const omniStatusLabel = (status: string) => {
    if (status === "ready") return "Omni Ready";
    if (status === "generating") return "Generating";
    if (status === "error") return "Error";
    if (status === "missing-headshot") return "Needs Headshot";
    if (status === "needs-style") return "Pick Style";
    return "Needs Omni";
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const trimStart = current.audioAsset?.trimStartSec ?? 0;
      const t = audio.currentTime + trimStart;
      setPreviewTime(audio.currentTime);
      const idx = previewScenes.findIndex(
        (scene) => t >= scene.startSec && t < scene.endSec,
      );
      if (idx >= 0) {
        setCurrentSceneIndex(idx);
        const scene = previewScenes[idx];
        const video = videoRef.current;
        if (video && scene.clipUrl) {
          const clipTime = Math.max(0, t - scene.startSec);
          if (Math.abs(video.currentTime - clipTime) > 0.35) {
            video.currentTime = clipTime;
          }
          if (isPlaying && video.paused) {
            video.play().catch(() => undefined);
          }
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [current.audioAsset?.trimStartSec, isPlaying, previewScenes]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-14">
        <aside className="hidden w-56 shrink-0 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 sm:flex">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Hearthril
          </p>
          <Link
            href="/projects"
            className="text-sm font-medium text-slate-300 hover:text-white"
          >
            Projects
          </Link>
          <Link
            href="/style-packs"
            className="text-sm font-medium text-slate-300 hover:text-white"
          >
            Style Packs
          </Link>
          <div className="mt-2 border-t border-slate-800 pt-4">
            {isRenamingProject ? (
              <Input
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                onBlur={() => setIsRenamingProject(false)}
                onKeyDown={async (event) => {
                  if (event.key === "Escape") {
                    setIsRenamingProject(false);
                    return;
                  }
                  if (event.key !== "Enter") return;
                  const next = projectNameDraft.trim();
                  if (!next || next === current.title) {
                    setIsRenamingProject(false);
                    return;
                  }
                  const response = await fetch(`/api/projects/${project.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: next }),
                  });
                  if (response.ok) {
                    const data = await response.json().catch(() => null);
                    if (data?.title) {
                      setCurrent((prev) => ({ ...prev, title: data.title }));
                    }
                  }
                  setIsRenamingProject(false);
                }}
                autoFocus
                className="mt-2 h-9 border-slate-800 bg-slate-900/80 text-sm text-slate-100"
              />
            ) : (
              <button
                type="button"
                className="mt-2 text-left text-sm font-medium text-slate-100 hover:underline"
                onClick={() => {
                  setProjectNameDraft(current.title);
                  setIsRenamingProject(true);
                }}
              >
                {current.title}
              </button>
            )}
            <div className="mt-4 flex flex-col gap-2 text-sm font-medium">
              <Link
                href={`/projects/${project.id}/edit`}
                className="text-slate-100 underline underline-offset-4"
              >
                Project Setup
              </Link>
              <Link
                href={`/projects/${project.id}/storyboard`}
                className="text-slate-300 hover:text-white"
              >
                Storyboard
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex w-full flex-col gap-6">
          <header className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Project Setup
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  {current.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={!allScenesSelected}
                  onClick={async () => {
                    setJobNote("Animating winners...");
                    const response = await fetch(
                      `/api/projects/${project.id}/animate-winners`,
                      { method: "POST" },
                    );
                    if (!response.ok) {
                      const payload = await response.json().catch(() => null);
                      setJobNote(payload?.error ?? "Animation failed");
                      return;
                    }
                    refreshProject();
                  }}
                >
                  Animate Winners
                </Button>
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
                      setCurrent((prev) => ({
                        ...prev,
                        stylePresetId: updated.stylePresetId,
                      }));
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
                  disabled={
                    !current.stylePresetId || !(current.characters ?? []).length
                  }
                  onClick={async () => {
                    setOmniProgress("Generating 0/0...");
                    const response = await fetch(
                      "/api/characters/generate-omni-all",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          projectId: project.id,
                          stylePresetId: current.stylePresetId,
                        }),
                      },
                    );
                    const payload = await response.json().catch(() => null);
                    if (!response.ok) {
                      setOmniProgress(payload?.error ?? "Omni generation failed");
                      return;
                    }
                    setOmniProgress(payload?.message ?? "Omni refs ready");
                    refreshProject();
                  }}
                >
                  Generate Omni Refs for All
                </Button>
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
            </div>
          {jobNote ? (
            <div className="mt-3 rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
              {jobNote}
            </div>
          ) : null}
          {!current.stylePresetId ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Pick a style to generate consistent character references.
            </div>
          ) : null}
          {omniProgress ? (
            <div className="mt-2 text-xs text-slate-400">{omniProgress}</div>
          ) : null}
          {current.characters?.length && !allCharactersOmniReady ? (
            <div className="mt-2 text-xs text-amber-400">
              Omni refs are required before storyboarding and image generation.
            </div>
          ) : null}
          </header>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <CardTitle>Cast</CardTitle>
          </CardHeader>
          <CardContent>
            {(current.characters ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">
                Add a character to generate an omni reference.
              </p>
            ) : (
              <div className="flex w-full flex-nowrap gap-3 overflow-x-auto pb-1">
                {(current.characters ?? []).map((character) => {
                  const omniRef = getOmniRefForStyle(
                    character,
                    current.stylePresetId,
                  );
                  const omniVariants = (character.omniVariants ?? []).filter(
                    (variant) => variant.stylePresetId === current.stylePresetId,
                  );
                  const selectedVariant =
                    omniVariants.find(
                      (variant) => variant.isSelected && variant.imageUrl,
                    ) ??
                    omniVariants.find((variant) => variant.imageUrl) ??
                    null;
                  const headshot = getCharacterHeadshotUrl(character);
                  const headshotUrl = headshot
                    ? displayAssetUrl(headshot) ?? headshot
                    : null;
                  const thumbUrl =
                    selectedVariant?.imageUrl ?? omniRef?.imageUrl ?? headshotUrl;
                  const status = characterStatusForStyle(
                    character,
                    current.stylePresetId,
                  );
                  return (
                    <div
                      key={character.id}
                      className="w-[170px] shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-800">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={character.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                            No image
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-100">
                          {character.name}
                        </p>
                        <Badge
                          variant={status === "error" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {omniStatusLabel(status)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <CardTitle>Style Pack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={current.stylePack?.id ?? ""}
                onValueChange={async (value) => {
                  if (!value) return;
                  const response = await fetch(
                    `/api/projects/${project.id}/style-packs/use-global`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ stylePackId: value }),
                    },
                  );
                  if (response.ok) {
                    refreshProject();
                  }
                }}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Select a style pack" />
                </SelectTrigger>
                <SelectContent>
                  {globalStylePacks.map((pack) => (
                    <SelectItem key={pack.id} value={pack.id}>
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!current.stylePack || current.stylePack.styleRefs.length === 0 ? (
              <p className="text-sm text-slate-400">
                Choose a style pack to preview its references here.
              </p>
            ) : (
              <div className="flex w-full flex-nowrap gap-3 overflow-x-auto pb-1">
                {current.stylePack.styleRefs.map((style) => (
                  <div
                    key={style.id}
                    className="w-[160px] shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <img
                      src={displayAssetUrl(style.imageUrl) ?? style.imageUrl}
                      alt={style.name ?? "Style reference"}
                      className="h-20 w-full rounded-lg object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Characters</CardTitle>
              <Button variant="secondary" size="sm" onClick={() => openCharacterModal()}>
                Add character
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {(current.characters ?? []).map((character) => {
              const omniRef = getOmniRefForStyle(character, current.stylePresetId);
              const omniVariants = (character.omniVariants ?? []).filter(
                (variant) => variant.stylePresetId === current.stylePresetId,
              );
              const sortedVariants = [...omniVariants].sort(
                (a, b) => (a.index ?? 0) - (b.index ?? 0),
              );
              const selectedVariant =
                sortedVariants.find(
                  (variant) => variant.isSelected && variant.imageUrl,
                ) ??
                sortedVariants.find((variant) => variant.imageUrl) ??
                null;
              const headshot = getCharacterHeadshotUrl(character);
              const status = characterStatusForStyle(
                character,
                current.stylePresetId,
              );
              return (
                <div
                  key={character.id}
                  ref={(node) => {
                    characterRefs.current[character.id] = node;
                  }}
                  className="rounded-2xl border bg-slate-950/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {editingCharacterId === character.id ? (
                      <Input
                        value={editingCharacterName}
                        onChange={(event) => setEditingCharacterName(event.target.value)}
                        onBlur={async () => {
                          await saveCharacterName(
                            character.id,
                            editingCharacterName,
                          );
                          setEditingCharacterId(null);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key === "Escape") {
                            setEditingCharacterId(null);
                            return;
                          }
                          if (event.key !== "Enter") return;
                          event.currentTarget.blur();
                        }}
                        className="h-9 w-full max-w-[240px] border-slate-800 bg-slate-900/80 text-sm text-slate-100"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left text-base font-semibold text-slate-200 hover:underline"
                        onClick={() => {
                          setEditingCharacterId(character.id);
                          setEditingCharacterName(character.name);
                        }}
                      >
                        {character.name}
                      </button>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        className={
                          character.descriptionPrompt?.trim()
                            ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                            : "bg-orange-500 text-white hover:bg-orange-600"
                        }
                        disabled={!headshot || promptLoadingId === character.id}
                        onClick={() => generateCharacterPrompt(character.id)}
                      >
                        {promptLoadingId === character.id
                          ? "Generating prompt..."
                          : "Generate Prompt"}
                      </Button>
                      <span className="relative inline-flex group">
                        <Button
                          className={
                            character.descriptionPrompt?.trim()
                              ? "bg-orange-500 text-white hover:bg-orange-600"
                              : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                          }
                          disabled={
                            !current.stylePresetId ||
                            !headshot ||
                            !character.descriptionPrompt?.trim()
                          }
                          onClick={async () => {
                            if (!current.stylePresetId) return;
                            setOmniProgress(`Generating ${character.name}...`);
                            const response = await fetch(
                              `/api/characters/${character.id}/omni/generate`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  stylePresetId: current.stylePresetId,
                                }),
                              },
                            );
                            const payload = await response.json().catch(() => null);
                            if (!response.ok) {
                              setOmniProgress(
                                payload?.error ?? "Omni generation failed",
                              );
                              return;
                            }
                            setOmniProgress(`Generated ${character.name}`);
                            refreshProject();
                          }}
                        >
                          Generate Character Reference
                        </Button>
                        {!character.descriptionPrompt?.trim() ? (
                          <span className="pointer-events-none absolute -top-9 right-0 rounded-md border border-slate-700 bg-slate-900/95 px-2 py-1 text-[11px] text-slate-200 opacity-0 transition group-hover:opacity-100">
                            Generate prompt prior to creating reference
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-6">
                    <div className="flex items-start gap-6">
                      <div className="flex flex-col items-start gap-2">
                        <button
                          type="button"
                          className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 text-4xl text-slate-300 hover:border-slate-500"
                          onClick={() =>
                            openCharacterModal({
                              id: character.id,
                              name: character.name,
                            })
                          }
                        >
                          {headshot ? (
                            <img
                              src={displayAssetUrl(headshot) ?? headshot}
                              alt={`${character.name} headshot`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-3xl font-semibold">+</span>
                          )}
                        </button>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Headshot
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <div className="h-40 w-40 overflow-hidden rounded-2xl bg-slate-800">
                          {selectedVariant?.imageUrl ? (
                            <img
                              src={selectedVariant.imageUrl}
                              alt={`${character.name} character`}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Character
                        </p>
                        {omniRef?.errorMessage ? (
                          <p className="text-xs text-rose-600">
                            {omniRef.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Variants
                      </p>
                      <div className="flex gap-3">
                        {sortedVariants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            className={`relative h-28 w-28 overflow-hidden rounded-2xl border ${
                              variant.isSelected
                                ? "border-amber-300"
                                : "border-slate-800"
                            } bg-slate-950/60`}
                            onClick={async () => {
                              await fetch(
                                `/api/characters/${character.id}/omni/select`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    stylePresetId: current.stylePresetId,
                                    variantId: variant.id,
                                  }),
                                },
                              );
                              refreshProject();
                            }}
                          >
                            <button
                              type="button"
                              className="absolute right-2 top-2 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                              onClick={async (event) => {
                                event.stopPropagation();
                                await fetch(`/api/omni/variants/${variant.id}`, {
                                  method: "DELETE",
                                });
                                refreshProject();
                              }}
                            >
                              ×
                            </button>
                            {variant.imageUrl ? (
                              <>
                                <img
                                  src={variant.imageUrl}
                                  alt={`${character.name} variant`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-100">
                                  Select
                                </span>
                              </>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                {variant.status === "error"
                                  ? (variant.failureReason ?? "Failed")
                                  : variant.status === "running"
                                    ? "Dreaming"
                                    : "Queued"}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Reference Prompt
                    </p>
                    <textarea
                      value={character.descriptionPrompt ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCurrent((prev) => ({
                          ...prev,
                          characters: (prev.characters ?? []).map((item) =>
                            item.id === character.id
                              ? { ...item, descriptionPrompt: value }
                              : item,
                          ),
                        }));
                      }}
                      onBlur={(event) => {
                        saveCharacterPrompt(character.id, event.target.value);
                      }}
                      placeholder="Auto-generated prompt will appear here. Edit before generating the character reference."
                      className="w-full min-h-[90px] rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {characterModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {characterModalId ? "Update character" : "Add character"}
                </h2>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white"
                  onClick={() => setCharacterModalOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setCharacterModalFile(file);
                  }}
                />
                {characterModalError ? (
                  <p className="text-xs text-rose-400">{characterModalError}</p>
                ) : null}
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={characterModalSaving}
                  onClick={() => setCharacterModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveCharacter}
                  disabled={characterModalSaving}
                >
                  {characterModalSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}


        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <CardTitle>Cast Strip</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {(current.characters ?? []).map((character) => {
                const omniRef = getOmniRefForStyle(
                  character,
                  current.stylePresetId,
                );
                const headshot = getCharacterHeadshotUrl(character);
                const status = characterStatusForStyle(
                  character,
                  current.stylePresetId,
                );
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => {
                      characterRefs.current[character.id]?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                    className="min-w-[200px] rounded-2xl border bg-slate-950/60 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-slate-800">
                        {omniRef?.imageUrl ? (
                          <img
                            src={omniRef.imageUrl}
                            alt={character.name}
                            className="h-full w-full object-cover"
                          />
                        ) : headshot ? (
                          <img
                            src={displayAssetUrl(headshot) ?? headshot}
                            alt={character.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {character.name}
                        </p>
                        <Badge variant={status === "error" ? "destructive" : "secondary"}>
                          {statusLabel(status)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
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
              <Button asChild variant="ghost">
                <Link href={`/projects/${project.id}/storyboard`}>
                  Edit transcript & storyboard →
                </Link>
              </Button>
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
                  <div className="space-y-2 rounded-2xl border bg-slate-900/70 p-4">
                    <p className="text-sm font-medium text-slate-200">
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
                  <div className="space-y-2 rounded-2xl border bg-slate-900/70 p-4">
                    <p className="text-sm font-medium text-slate-200">
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

        

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <CardTitle>Image Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {current.scenes.map((scene) => (
              <div key={scene.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">
                    Scene {scene.index + 1}
                  </p>
                  {!scene.imageCandidates.some((candidate) => candidate.isSelected) ? (
                    <Badge variant="secondary">Pick a winner</Badge>
                  ) : (
                    <Badge>Winner selected</Badge>
                  )}
                </div>
                {scene.imageCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Generate images on the storyboard page.
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sequence Preview</CardTitle>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>
                {new Date(previewTime * 1000).toISOString().slice(14, 19)}
              </span>
              <span>/</span>
              <span>{new Date(totalDuration * 1000).toISOString().slice(14, 19)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!current.audioAsset || previewScenes.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-slate-950/60 p-6 text-sm text-muted-foreground">
                Upload audio and generate storyboard scenes to preview the sequence.
              </div>
            ) : (
              <>
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-black">
                  {previewScenes[currentSceneIndex]?.clipUrl ? (
                    <video
                      ref={videoRef}
                      key={previewScenes[currentSceneIndex].clipUrl ?? "clip"}
                      src={previewScenes[currentSceneIndex].clipUrl ?? undefined}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                  ) : previewScenes[currentSceneIndex]?.imageUrl ? (
                    <img
                      src={previewScenes[currentSceneIndex].imageUrl ?? ""}
                      alt="Scene preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
                      No preview available
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    Scene {previewScenes[currentSceneIndex]?.index + 1}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={!current.audioAsset}
                    onClick={async () => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      if (isPlaying) {
                        audio.pause();
                        videoRef.current?.pause();
                        setIsPlaying(false);
                        return;
                      }
                      const trimStart = current.audioAsset?.trimStartSec ?? 0;
                      audio.currentTime = trimStart;
                      await audio.play();
                      setIsPlaying(true);
                    }}
                  >
                    {isPlaying ? "Pause" : "Play sequence"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.pause();
                      audio.currentTime = current.audioAsset?.trimStartSec ?? 0;
                      videoRef.current?.pause();
                      setIsPlaying(false);
                      setCurrentSceneIndex(0);
                    }}
                  >
                    Restart
                  </Button>
                  <audio
                    ref={audioRef}
                    src={current.audioAsset.originalUrl}
                    preload="metadata"
                  />
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {allScenesSelected ? "Ready to animate" : "Select all winners"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-slate-900/80 shadow-sm">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 overflow-x-auto">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Audio
              </div>
              <div
                className="relative h-10 rounded-lg bg-slate-800"
                style={{ width: `${timelineWidth}px` }}
              >
                <div className="h-full w-full rounded-lg bg-slate-400/60" />
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Images (auto-placed by scene timestamps)
              </div>
              <div
                className="relative h-16 rounded-lg bg-slate-100"
                style={{ width: `${timelineWidth}px` }}
              >
                {sceneBlocks.map((scene) => (
                  <div
                    key={scene.id}
                    className="absolute top-1 flex h-14 items-center justify-center overflow-hidden rounded bg-slate-800 text-xs font-medium text-slate-100"
                    style={{
                      left: `${scene.left}px`,
                      width: `${Math.max(scene.width, 24)}px`,
                      backgroundImage: scene.imageUrl
                        ? `url(${scene.imageUrl})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    {!scene.imageUrl ? `Scene ${scene.index + 1}` : null}
                  </div>
                ))}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Animation Clips
              </div>
              <div
                className="relative h-12 rounded-lg bg-slate-100"
                style={{ width: `${timelineWidth}px` }}
              >
                {current.scenes.map((scene) => {
                  const clip = scene.animationClips.at(-1);
                  if (!clip) return null;
                  const clipWidth =
                    clip.durationSec && clip.status === "ready"
                      ? clip.durationSec * timelineScale
                      : 5 * timelineScale;
                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-1 flex h-10 items-center justify-center rounded text-xs font-medium ${
                        clip.status === "ready"
                          ? "bg-amber-300/70 text-slate-100"
                          : "bg-slate-700/70 text-slate-200"
                      }`}
                      style={{
                        left: `${(scene.startMs / 1000) * timelineScale}px`,
                        width: `${clipWidth}px`,
                      }}
                    >
                      {clip.status === "ready" ? "Clip" : "Animating"}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
