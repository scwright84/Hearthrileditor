"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AnimationStyle = {
  id: string;
  internalStyleRef: string;
  brandedName: string;
  defaultCategories: string[];
  description: string;
  mjStyleModifier?: string | null;
  referenceImageUrl?: string | null;
  promptInput?: string | null;
  stylePrompt?: string | null;
  imageUrl?: string | null;
  selectedVariantId?: string | null;
  variants?: {
    id: string;
    status: "queued" | "running" | "ready" | "error";
    imageUrl?: string | null;
    failureReason?: string | null;
    index?: number | null;
  }[];
  updatedAt: string;
};

export default function AnimationStylesManager() {
  const [styles, setStyles] = useState<AnimationStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [lockedStyleIds, setLockedStyleIds] = useState<Set<string>>(new Set());
  const [locksInitialized, setLocksInitialized] = useState(false);
  const hasCatalog = styles.length >= 20;

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/animation-styles", { cache: "no-store" });
    const data = await response.json().catch(() => []);
    const nextStyles = Array.isArray(data) ? data : [];
    setStyles(nextStyles);
    if (!locksInitialized) {
      setLockedStyleIds(new Set(nextStyles.map((style) => style.id)));
      setLocksInitialized(true);
    }
    setLoading(false);
  };

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

  const pendingVariantIds = styles
    .flatMap((style) => style.variants ?? [])
    .filter((variant) => ["queued", "running"].includes(variant.status))
    .map((variant) => variant.id);

  useEffect(() => {
    if (pendingVariantIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        pendingVariantIds.map((id) =>
          fetch(`/api/animation-styles/variants/${id}/status`).catch(() => null),
        ),
      );
      await load();
    }, 2500);
    return () => clearInterval(interval);
  }, [pendingVariantIds.join("|")]);

  useEffect(() => {
    load();
  }, []);

  const commitName = async (style: AnimationStyle, value: string) => {
    const nextName = value.trim();
    setEditingId(null);
    if (!nextName || nextName === style.brandedName) {
      setDraftName("");
      return;
    }
    setStyles((prev) =>
      prev.map((item) =>
        item.id === style.id ? { ...item, brandedName: nextName } : item,
      ),
    );
    await fetch(`/api/animation-styles/${style.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandedName: nextName }),
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-14">
        <aside className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-4 self-start rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 sm:flex">
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
            className="text-sm font-medium text-slate-100 underline underline-offset-4"
          >
            Animation Library
          </Link>
        </aside>

        <div className="flex w-full flex-col gap-8">
          <header className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-100">
                Animation Library
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!styles.length}
                  onClick={() => {
                    const lines = styles
                      .map((style) => {
                        const prompt = style.stylePrompt?.trim();
                        if (!prompt) return null;
                        return `${style.brandedName}: ${prompt}`;
                      })
                      .filter(Boolean)
                      .join("\n\n");
                    if (lines) {
                      navigator.clipboard.writeText(lines);
                    }
                  }}
                >
                  Copy All Prompts
                </Button>
              </div>
            </div>
          </header>

          <div className="h-px w-full bg-slate-800" />

          {loading ? (
            <p className="text-sm text-slate-400">Loading animation styles…</p>
          ) : styles.length === 0 ? (
            <p className="text-sm text-slate-400">No animation styles yet.</p>
          ) : (
            <section className="flex flex-col gap-5">
              {styles.map((style) => {
                const isEditing = editingId === style.id;
                const referenceImage = displayAssetUrl(style.referenceImageUrl);
                return (
                  <Card
                    key={style.id}
                    className="border-slate-800 bg-slate-900/60 text-slate-100"
                  >
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <CardTitle className="text-lg">
                        {isEditing ? (
                          <Input
                            value={draftName}
                            autoFocus
                            onChange={(event) => setDraftName(event.target.value)}
                            onBlur={(event) => commitName(style, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                commitName(style, draftName);
                              }
                              if (event.key === "Escape") {
                                setEditingId(null);
                                setDraftName("");
                              }
                            }}
                            className="h-8 max-w-[260px]"
                          />
                        ) : (
                          <button
                            type="button"
                            className="font-semibold text-slate-100 hover:underline"
                            onClick={() => {
                              setEditingId(style.id);
                              setDraftName(style.brandedName);
                            }}
                          >
                            {style.brandedName}
                          </button>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          className="bg-orange-500 text-white hover:bg-orange-600"
                          disabled={
                            generatingId === style.id ||
                            (!style.referenceImageUrl &&
                              !(style.description ?? "").trim())
                          }
                          onClick={async () => {
                            setGeneratingId(style.id);
                            await fetch(`/api/animation-styles/${style.id}/describe`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                promptInput: style.description ?? "",
                              }),
                            });
                            setGeneratingId(null);
                            await load();
                          }}
                        >
                          {generatingId === style.id
                            ? "Generating..."
                            : "Generate Style Prompt"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await fetch(`/api/animation-styles/${style.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                description: style.description ?? "",
                              }),
                            });
                            setLockedStyleIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(style.id)) {
                                next.delete(style.id);
                              } else {
                                next.add(style.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {lockedStyleIds.has(style.id) ? "Unlock" : "Lock"}
                        </Button>
                        {pendingDeleteId === style.id ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400">
                              Delete this style?
                            </span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleting === style.id}
                              onClick={async () => {
                                setDeleting(style.id);
                                await fetch(`/api/animation-styles/${style.id}`, {
                                  method: "DELETE",
                                });
                                setDeleting(null);
                                setPendingDeleteId(null);
                                await load();
                              }}
                            >
                              {deleting === style.id ? "Deleting..." : "Confirm"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleting === style.id}
                              onClick={() => setPendingDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-base text-white shadow-sm hover:bg-red-600"
                            onClick={() => setPendingDeleteId(style.id)}
                            aria-label="Delete animation style"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-4">
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Reference
                            </p>
                            <label className="flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-500">
                              {referenceImage ? (
                                <img
                                  src={referenceImage}
                                  alt={`${style.brandedName} reference`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-3xl font-semibold">+</span>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                disabled={lockedStyleIds.has(style.id)}
                                onChange={async (event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  if (!file) return;
                                  setUploadingId(style.id);
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  await fetch(
                                    `/api/animation-styles/${style.id}/reference-image`,
                                    {
                                      method: "POST",
                                      body: formData,
                                    },
                                  );
                                  setUploadingId(null);
                                  await load();
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                          </div>
                          <div className="flex flex-1 flex-col gap-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Style Notes
                            </p>
                            <textarea
                              value={style.description}
                              onChange={(event) => {
                                const value = event.target.value;
                                setStyles((prev) =>
                                  prev.map((item) =>
                                    item.id === style.id
                                      ? { ...item, description: value }
                                      : item,
                                  ),
                                );
                              }}
                              onBlur={async (event) => {
                                await fetch(`/api/animation-styles/${style.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    description: event.target.value,
                                  }),
                                });
                              }}
                              disabled={lockedStyleIds.has(style.id)}
                              className="min-h-[120px] w-full rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-100 placeholder:text-slate-500"
                              placeholder="Describe the style in your own words..."
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Style Prompt
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!style.stylePrompt}
                              onClick={() => {
                                if (style.stylePrompt) {
                                  navigator.clipboard.writeText(style.stylePrompt);
                                }
                              }}
                            >
                              Copy Prompt
                            </Button>
                          </div>
                          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200">
                            {style.stylePrompt ||
                              "Generate Style Prompt to create the reference prompt."}
                          </div>
                        </div>
                        {style.variants?.length ? (
                          <div className="flex flex-wrap gap-3">
                            {style.variants.map((variant) => {
                              const isSelected =
                                style.selectedVariantId === variant.id;
                              return (
                                <div
                                  key={variant.id}
                                  className={`flex h-24 w-24 flex-col overflow-hidden rounded-2xl border ${
                                    isSelected
                                      ? "border-orange-400"
                                      : "border-slate-800"
                                  } bg-slate-950/50`}
                                >
                                  <div className="relative flex h-full w-full items-center justify-center">
                                    {variant.imageUrl ? (
                                      <img
                                        src={variant.imageUrl}
                                        alt={`${style.brandedName} variant`}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                        {variant.status === "error"
                                          ? "Failed"
                                          : variant.status === "running"
                                            ? "Dreaming"
                                            : "Queued"}
                                      </div>
                                    )}
                                  </div>
                                  {variant.imageUrl ? (
                                    <button
                                      type="button"
                                      className={`text-[10px] uppercase tracking-[0.2em] ${
                                        isSelected
                                          ? "bg-orange-500 text-white"
                                          : "bg-slate-900 text-slate-300"
                                      }`}
                                      onClick={async () => {
                                        await fetch(
                                          `/api/animation-styles/${style.id}/select`,
                                          {
                                            method: "POST",
                                            headers: {
                                              "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                              variantId: variant.id,
                                            }),
                                          },
                                        );
                                        await load();
                                      }}
                                    >
                                      {isSelected ? "Selected" : "Select"}
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
