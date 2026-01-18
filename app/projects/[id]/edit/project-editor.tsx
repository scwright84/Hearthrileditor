"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCharacterHeadshotUrl } from "@/lib/characters";

type AnimationStyle = {
  id: string;
  brandedName: string;
  description: string;
  mjStyleModifier?: string | null;
  referenceImageUrl?: string | null;
  stylePrompt?: string | null;
};

type OmniRef = {
  id: string;
  stylePresetId: string;
  status: "pending" | "generating" | "ready" | "error";
  selectedVariantId?: string | null;
  imageUrl?: string | null;
  errorMessage?: string | null;
};

type OmniVariant = {
  id: string;
  stylePresetId: string;
  status: "queued" | "running" | "ready" | "error";
  imageUrl?: string | null;
  failureReason?: string | null;
  index?: number | null;
  isSelected?: boolean;
  createdAt: string;
};

type CharacterReference = {
  id: string;
  name: string;
  descriptionPrompt?: string | null;
  imageUrls?: unknown;
  safeHeadshotUrl?: string | null;
  omniRefs?: OmniRef[];
  omniVariants?: OmniVariant[];
};

type ProjectPayload = {
  id: string;
  title: string;
  stylePresetId?: string | null;
  animationStyle?: AnimationStyle | null;
  characters: CharacterReference[];
};

export default function ProjectEditor({
  project,
}: {
  project: ProjectPayload;
}) {
  const [current, setCurrent] = useState(project);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.title);
  const [animationStyles, setAnimationStyles] = useState<AnimationStyle[]>([]);
  const [jobNote, setJobNote] = useState<string | null>(null);
  const [showAnimationStylePicker, setShowAnimationStylePicker] = useState(false);
  const [addingCharacter, setAddingCharacter] = useState(false);
  const [uploadingCharacterId, setUploadingCharacterId] = useState<string | null>(
    null,
  );
  const [promptLoadingId, setPromptLoadingId] = useState<string | null>(null);
  const [generatingCharacterId, setGeneratingCharacterId] = useState<
    string | null
  >(null);
  const [confirmDeleteCharacterId, setConfirmDeleteCharacterId] = useState<
    string | null
  >(null);
  const [deletingCharacterId, setDeletingCharacterId] = useState<string | null>(
    null,
  );
  const [selectingVariantId, setSelectingVariantId] = useState<string | null>(
    null,
  );
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(
    null,
  );
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const [eventsEnabled, setEventsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("hr_events_enabled") !== "false";
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

  useEffect(() => {
    const loadAnimationStyles = async () => {
      const response = await fetch("/api/animation-styles");
      if (!response.ok) return;
      const data = await response.json();
      setAnimationStyles(Array.isArray(data) ? data : []);
    };
    loadAnimationStyles();
  }, []);

  const pendingVariantIds = useMemo(() => {
    return current.characters
      .flatMap((character) => character.omniVariants ?? [])
      .filter((variant) => ["queued", "running"].includes(variant.status))
      .map((variant) => variant.id);
  }, [current.characters]);

  useEffect(() => {
    if (pendingVariantIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        pendingVariantIds.map((id) =>
          fetch(`/api/omni/variants/${id}/status`).catch(() => null),
        ),
      );
      await refreshProject();
    }, 2500);
    return () => clearInterval(interval);
  }, [pendingVariantIds.join("|"), refreshProject]);

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

  const selectAnimationStyle = async (value: string) => {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animationStyleId: value }),
    });
    if (response.ok) {
      const updated = await response.json();
      const selected =
        animationStyles.find((item) => item.id === updated.animationStyleId) ??
        null;
      setCurrent((prev) => ({
        ...prev,
        animationStyle: selected,
      }));
    }
  };

  const createCharacterWithHeadshot = async (file: File) => {
    if (addingCharacter) return;
    setAddingCharacter(true);
    try {
      const fallbackName = `Character ${current.characters.length + 1}`;
      const response = await fetch(`/api/projects/${project.id}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fallbackName }),
      });
      if (!response.ok) return;
      const created = await response.json().catch(() => null);
      if (!created?.id) return;

      const formData = new FormData();
      formData.append("file", file);
      await fetch(`/api/characters/${created.id}/headshot`, {
        method: "POST",
        body: formData,
      });
      await refreshProject();
    } finally {
      setAddingCharacter(false);
    }
  };

  const uploadHeadshotForCharacter = async (characterId: string, file: File) => {
    if (uploadingCharacterId) return;
    setUploadingCharacterId(characterId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`/api/characters/${characterId}/headshot`, {
        method: "POST",
        body: formData,
      });
      await refreshProject();
    } finally {
      setUploadingCharacterId(null);
    }
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

  const generateCharacterReference = async (characterId: string) => {
    if (!current.stylePresetId) {
      setJobNote("Missing style preset. Create a new project to retry.");
      return;
    }
    setGeneratingCharacterId(characterId);
    await fetch(`/api/characters/${characterId}/omni/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stylePresetId: current.stylePresetId }),
    });
    setGeneratingCharacterId(null);
    await refreshProject();
  };

  const selectCharacterVariant = async (
    characterId: string,
    variantId: string,
  ) => {
    if (!current.stylePresetId) return;
    setSelectingVariantId(variantId);
    await fetch(`/api/characters/${characterId}/omni/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stylePresetId: current.stylePresetId,
        variantId,
      }),
    });
    setSelectingVariantId(null);
    await refreshProject();
  };

  const uploadManualVariant = async (characterId: string, file: File) => {
    if (!current.stylePresetId || uploadingVariantId) return;
    setUploadingVariantId(characterId);
    try {
      const formData = new FormData();
      formData.append("stylePresetId", current.stylePresetId);
      formData.append("file", file);
      await fetch(`/api/characters/${characterId}/omni/upload`, {
        method: "POST",
        body: formData,
      });
      await refreshProject();
    } finally {
      setUploadingVariantId(null);
    }
  };

  const deleteCharacter = async (characterId: string) => {
    if (deletingCharacterId) return;
    setDeletingCharacterId(characterId);
    try {
      const response = await fetch(`/api/characters/${characterId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await refreshProject();
      }
    } finally {
      setDeletingCharacterId(null);
      setConfirmDeleteCharacterId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-14">
        <aside className="sticky top-6 hidden h-fit w-56 shrink-0 flex-col gap-4 self-start rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 sm:flex">
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
            href="/animation-styles"
            className="text-sm font-medium text-slate-300 hover:text-white"
          >
            Animation Library
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
                Characters & Style
              </Link>
              <Link
                href={`/projects/${project.id}/storyboard`}
                className="text-slate-300 hover:text-white"
              >
                Audio
              </Link>
              <Link
                href={`/projects/${project.id}/storyboard-board`}
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
                  Characters & Style
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  {current.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEventsEnabled((prev) => !prev)}
                >
                  Live Updates: {eventsEnabled ? "On" : "Off"}
                </Button>
              </div>
            </div>
            {jobNote ? (
              <div className="mt-3 rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                {jobNote}
              </div>
            ) : null}
          </header>

          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href={`/projects/${project.id}/storyboard`}>
                  Open Editor →
                </Link>
              </Button>
            </div>
          </div>

          <Card className="border-0 bg-slate-900/80 shadow-sm">
            <CardHeader>
              <CardTitle>Animation Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="flex h-11 w-[280px] items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 text-sm text-slate-200"
                  onClick={() => setShowAnimationStylePicker(true)}
                >
                  <span>
                    {current.animationStyle?.brandedName ||
                      "Select an animation style"}
                  </span>
                  <span className="text-xs text-slate-500">Choose</span>
                </button>
              </div>
              {!current.animationStyle ? (
                <p className="text-sm text-slate-400">
                  Choose an animation style to guide prompt wording.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Reference
                    </p>
                    <div className="h-28 w-28 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                      {current.animationStyle.referenceImageUrl ? (
                        <img
                          src={
                            displayAssetUrl(
                              current.animationStyle.referenceImageUrl,
                            ) ?? current.animationStyle.referenceImageUrl
                          }
                          alt={current.animationStyle.brandedName}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Generated Reference
                    </p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                      {current.animationStyle.stylePrompt ||
                        current.animationStyle.description}
                    </div>
                  </div>
                </div>
              )}
              {showAnimationStylePicker ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 py-10">
                  <div className="flex w-full max-w-4xl max-h-[80vh] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-100">
                        Choose Animation Style
                      </h3>
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => setShowAnimationStylePicker(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-4 grid flex-1 gap-4 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-3">
                      {animationStyles.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-left text-sm text-slate-200 hover:border-slate-600"
                          onClick={async () => {
                            await selectAnimationStyle(style.id);
                            setShowAnimationStylePicker(false);
                          }}
                        >
                          <div className="h-28 w-28 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                            {style.referenceImageUrl ? (
                              <img
                                src={
                                  displayAssetUrl(style.referenceImageUrl) ??
                                  style.referenceImageUrl
                                }
                                alt={style.brandedName}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <span className="font-medium">{style.brandedName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-0 bg-slate-900/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
              <CardTitle>Characters</CardTitle>
              <div className="flex items-center gap-3">
                <Input
                  ref={characterInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    createCharacterWithHeadshot(file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  size="sm"
                  className="bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={() => characterInputRef.current?.click()}
                >
                  Add Character
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {current.characters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  Add a character to upload a headshot and generate references.
                </div>
              ) : (
                current.characters.map((character) => {
                  const headshot = getCharacterHeadshotUrl(character);
                  const stylePresetId = current.stylePresetId ?? null;
                  const omniRef =
                    character.omniRefs?.find(
                      (ref) => ref.stylePresetId === stylePresetId,
                    ) ?? null;
                  const variants = (character.omniVariants ?? [])
                    .filter((variant) => variant.stylePresetId === stylePresetId)
                    .sort((a, b) => {
                      const aTime = new Date(a.createdAt).getTime();
                      const bTime = new Date(b.createdAt).getTime();
                      if (a.index != null && b.index != null) {
                        return a.index - b.index;
                      }
                      return aTime - bTime;
                    });
                  const selectedVariant =
                    variants.find((variant) => variant.isSelected) ||
                    variants.find(
                      (variant) => variant.id === omniRef?.selectedVariantId,
                    ) ||
                    variants.find((variant) => variant.status === "ready");

                  return (
                    <div
                      key={character.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <label
                            htmlFor={`headshot-${character.id}`}
                            className="flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60"
                            title={
                              uploadingCharacterId === character.id
                                ? "Uploading..."
                                : "Click to replace headshot"
                            }
                          >
                            {headshot ? (
                              <img
                                src={displayAssetUrl(headshot) ?? headshot}
                                alt={character.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-slate-500">
                                Upload
                              </span>
                            )}
                          </label>
                          <div>
                            <Input
                              value={character.name}
                              onChange={(event) =>
                                setCurrent((prev) => ({
                                  ...prev,
                                  characters: prev.characters.map((item) =>
                                    item.id === character.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                              onBlur={(event) =>
                                saveCharacterName(character.id, event.target.value)
                              }
                              className="h-9 w-[220px] border-slate-800 bg-slate-900/70 text-sm text-slate-100"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`headshot-${character.id}`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  uploadHeadshotForCharacter(character.id, file);
                                  event.currentTarget.value = "";
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!headshot || promptLoadingId === character.id}
                                onClick={() => generateCharacterPrompt(character.id)}
                              >
                                {promptLoadingId === character.id
                                  ? "Generating..."
                                  : "Generate Prompt"}
                              </Button>
                              <Button
                                size="sm"
                                className="bg-orange-500 text-white hover:bg-orange-600"
                                disabled={
                                  !character.descriptionPrompt ||
                                  generatingCharacterId === character.id
                                }
                                onClick={() =>
                                  generateCharacterReference(character.id)
                                }
                              >
                                {generatingCharacterId === character.id
                                  ? "Generating..."
                                  : "Generate Character Reference"}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {confirmDeleteCharacterId === character.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setConfirmDeleteCharacterId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-rose-500 text-white hover:bg-rose-600"
                                  disabled={deletingCharacterId === character.id}
                                  onClick={() => deleteCharacter(character.id)}
                                >
                                  {deletingCharacterId === character.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-200 hover:bg-rose-500/10"
                                onClick={() =>
                                  setConfirmDeleteCharacterId(character.id)
                                }
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Character
                            </p>
                            <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                              {selectedVariant?.imageUrl ? (
                                <img
                                  src={
                                    displayAssetUrl(selectedVariant.imageUrl) ??
                                    selectedVariant.imageUrl
                                  }
                                  alt={`${character.name} reference`}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Reference Prompt
                        </p>
                        <Textarea
                          value={character.descriptionPrompt ?? ""}
                          onChange={(event) =>
                            setCurrent((prev) => ({
                              ...prev,
                              characters: prev.characters.map((item) =>
                                item.id === character.id
                                  ? { ...item, descriptionPrompt: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                          onBlur={(event) =>
                            saveCharacterPrompt(character.id, event.target.value)
                          }
                          className="mt-2 min-h-[140px] border-slate-800 bg-slate-900/70 text-sm text-slate-100"
                        />
                      </div>

                      <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Variants
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id={`variant-upload-${character.id}`}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              uploadManualVariant(character.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                          <label
                            htmlFor={`variant-upload-${character.id}`}
                            className={`flex h-24 w-24 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 text-3xl text-slate-400 transition hover:border-slate-500 ${
                              !current.stylePresetId || uploadingVariantId === character.id
                                ? "cursor-not-allowed opacity-60"
                                : ""
                            }`}
                            title={
                              current.stylePresetId
                                ? "Add manual variant"
                                : "Select a style preset first"
                            }
                            onClick={(event) => {
                              if (!current.stylePresetId || uploadingVariantId === character.id) {
                                event.preventDefault();
                              }
                            }}
                          >
                            {uploadingVariantId === character.id ? "…" : "+"}
                          </label>
                          {variants.length === 0 ? (
                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 text-xs text-slate-400">
                              No variants
                            </div>
                          ) : null}
                          {variants.map((variant) => (
                              <div
                                key={variant.id}
                                className={`relative h-24 w-24 overflow-hidden rounded-2xl border ${
                                  variant.isSelected ||
                                  variant.id === omniRef?.selectedVariantId
                                    ? "border-orange-400"
                                    : "border-slate-800"
                                } bg-slate-950/60`}
                              >
                                {variant.imageUrl ? (
                                  <img
                                    src={
                                      displayAssetUrl(variant.imageUrl) ??
                                      variant.imageUrl
                                    }
                                    alt={`${character.name} variant`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                    {variant.status}
                                  </div>
                                )}
                                {variant.imageUrl ? (
                                  <button
                                    type="button"
                                    className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-200"
                                    onClick={() =>
                                      selectCharacterVariant(
                                        character.id,
                                        variant.id,
                                      )
                                    }
                                    disabled={selectingVariantId === variant.id}
                                  >
                                    {selectingVariantId === variant.id
                                      ? "Selecting..."
                                      : "Select"}
                                  </button>
                                ) : null}
                              </div>
                            ))}
                        </div>
                        {omniRef?.errorMessage ? (
                          <p className="mt-2 text-xs text-rose-300">
                            {omniRef.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
