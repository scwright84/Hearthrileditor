"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type StyleRef = {
  id: string;
  name?: string | null;
  imageUrl: string;
  weight: number;
};

type StylePack = {
  id: string;
  projectId?: string | null;
  name: string;
  isGlobal: boolean;
  styleRefs: StyleRef[];
  updatedAt: string;
};

export default function StylePacksManager() {
  const [packs, setPacks] = useState<StylePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [newPackName, setNewPackName] = useState("");
  const [pendingStyleDeleteId, setPendingStyleDeleteId] = useState<string | null>(
    null,
  );
  const scrollersRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [scrollState, setScrollState] = useState<
    Record<string, { left: boolean; right: boolean }>
  >({});

  const updateScrollState = (packId: string) => {
    const node = scrollersRef.current[packId];
    if (!node) return;
    const left = node.scrollLeft > 2;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
    setScrollState((prev) => {
      const current = prev[packId];
      if (current && current.left === left && current.right === right) {
        return prev;
      }
      return { ...prev, [packId]: { left, right } };
    });
  };

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/style-packs", { cache: "no-store" });
    const data = await response.json().catch(() => []);
    setPacks(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      packs.forEach((pack) => updateScrollState(pack.id));
    });
    return () => cancelAnimationFrame(raf);
  }, [packs]);

  const grouped = useMemo(() => packs, [packs]);

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

  const renderPack = (pack: StylePack) => {
    const isEditing = editingId === pack.id;

    const commitName = async (value: string) => {
      const nextName = value.trim();
      setEditingId(null);
      if (!nextName || nextName === pack.name) {
        setDraftName("");
        return;
      }
      setPacks((prev) =>
        prev.map((item) =>
          item.id === pack.id ? { ...item, name: nextName } : item,
        ),
      );
      await fetch(`/api/style-packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
    };

    return (
      <Card
        key={pack.id}
        className="border-slate-800 bg-slate-900/60 text-slate-100"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CardTitle className="text-lg">
              {isEditing ? (
                <Input
                  value={draftName}
                  autoFocus
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={(event) => commitName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitName(draftName);
                    }
                    if (event.key === "Escape") {
                      setEditingId(null);
                      setDraftName("");
                    }
                  }}
                  className="h-8 max-w-[240px]"
                />
              ) : (
                <button
                  type="button"
                  className="font-semibold text-slate-100 hover:underline"
                  onClick={() => {
                    setEditingId(pack.id);
                    setDraftName(pack.name);
                  }}
                >
                  {pack.name}
                </button>
              )}
            </CardTitle>
          </div>
        <div className="flex items-center gap-3">
          {pendingDeleteId === pack.id ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Delete this pack?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting === pack.id}
                onClick={async () => {
                  setDeleting(pack.id);
                  await fetch(`/api/style-packs/${pack.id}`, {
                    method: "DELETE",
                  });
                  setDeleting(null);
                  setPendingDeleteId(null);
                  await load();
                }}
              >
                {deleting === pack.id ? "Deleting..." : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deleting === pack.id}
                onClick={() => setPendingDeleteId(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="-mt-2 mr-[-6px] flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-base text-white shadow-sm hover:bg-red-600"
              onClick={() => setPendingDeleteId(pack.id)}
              aria-label="Delete style pack"
            >
              ×
            </button>
          )}
        </div>
      </CardHeader>
        <CardContent className="space-y-4">
        {pack.styleRefs.length === 0 ? (
          <p className="text-sm text-slate-400">
            No style images yet.
          </p>
        ) : (
          <div className="flex items-stretch gap-2">
            {scrollState[pack.id]?.left ? (
              <button
                type="button"
                className="flex w-8 items-center justify-center self-stretch rounded-2xl border border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600 hover:text-white"
                onClick={() => {
                  const node = scrollersRef.current[pack.id];
                  if (node) {
                    node.scrollBy({ left: -220, behavior: "smooth" });
                  }
                }}
                aria-label="Scroll left"
              >
                <span
                  aria-hidden
                  className="h-0 w-0 border-y-[8px] border-y-transparent border-r-[12px] border-r-slate-300"
                />
              </button>
            ) : null}
            <div
              ref={(node) => {
                scrollersRef.current[pack.id] = node;
                if (node) {
                  requestAnimationFrame(() => updateScrollState(pack.id));
                }
              }}
              onScroll={() => updateScrollState(pack.id)}
              className="flex w-full flex-1 flex-nowrap gap-3 overflow-x-auto pb-1"
            >
              <label className="relative w-[160px] shrink-0 cursor-pointer rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-3 text-slate-400 transition hover:border-slate-500 hover:text-slate-200">
                <span className="flex h-32 w-full items-center justify-center text-5xl font-semibold">
                  +
                </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={async (event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length === 0) return;
                  const createdRefs: StyleRef[] = [];
                  for (const file of files) {
                    const formData = new FormData();
                    formData.append("file", file);
                    const response = await fetch(
                      `/api/style-packs/${pack.id}/style-refs`,
                      {
                        method: "POST",
                        body: formData,
                      },
                    );
                    if (response.ok) {
                      const payload = await response.json().catch(() => null);
                      if (payload?.id) {
                        createdRefs.push(payload);
                      }
                    }
                  }
                  if (createdRefs.length > 0) {
                    setPacks((prev) =>
                      prev.map((item) =>
                        item.id === pack.id
                          ? {
                              ...item,
                              styleRefs: [...item.styleRefs, ...createdRefs],
                            }
                          : item,
                      ),
                    );
                  }
                  await load();
                  event.currentTarget.value = "";
                }}
              />
            </label>
              {pack.styleRefs.map((style) => (
                <div
                  key={style.id}
                  className="relative w-[160px] shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                >
                <button
                  type="button"
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={async () => {
                    await fetch(`/api/style-refs/${style.id}`, {
                      method: "DELETE",
                    });
                    await load();
                  }}
                  aria-label="Remove style image"
                >
                  ×
                </button>
                <img
                  src={displayAssetUrl(style.imageUrl) ?? style.imageUrl}
                  alt={style.name ?? "Style reference"}
                  className="mb-2 h-20 w-full rounded-lg object-cover"
                />
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Weight</span>
                    <span>{style.weight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={style.weight}
                    onChange={async (event) => {
                      const value = Number(event.target.value);
                      setPacks((prev) =>
                        prev.map((item) =>
                          item.id === pack.id
                            ? {
                                ...item,
                                styleRefs: item.styleRefs.map((ref) =>
                                  ref.id === style.id
                                    ? { ...ref, weight: value }
                                    : ref,
                                ),
                              }
                            : item,
                        ),
                      );
                      await fetch(`/api/style-refs/${style.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ weight: value }),
                      });
                    }}
                    className="mt-2 w-full"
                  />
                </div>
                </div>
              ))}
            </div>
            {scrollState[pack.id]?.right ? (
              <button
                type="button"
                className="flex w-8 items-center justify-center self-stretch rounded-2xl border border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600 hover:text-white"
                onClick={() => {
                  const node = scrollersRef.current[pack.id];
                  if (node) {
                    node.scrollBy({ left: 220, behavior: "smooth" });
                  }
                }}
                aria-label="Scroll right"
              >
                <span
                  aria-hidden
                  className="h-0 w-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-slate-300"
                />
              </button>
            ) : null}
          </div>
        )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-14">
        <aside className="hidden w-52 shrink-0 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 sm:flex">
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
            className="text-sm font-medium text-slate-100 underline underline-offset-4"
          >
            Style Packs
          </Link>
        </aside>

        <div className="flex w-full flex-col gap-8">
          <header className="flex flex-col gap-6">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-100">
                Style Packs
              </h1>
            </div>
            <div className="flex w-full items-center">
              <div className="flex w-full max-w-lg flex-col items-start gap-3">
                <p className="text-sm text-slate-400">
                  Name a style pack to get started.
                </p>
                <Input
                  placeholder="New style pack name"
                  value={newPackName}
                  onChange={(event) => setNewPackName(event.target.value)}
                  className="h-12 border-slate-700 bg-slate-900/80 text-base text-slate-100 placeholder:text-slate-500 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-500"
                />
                <Button
                  className="bg-orange-500 text-white hover:bg-orange-600"
                  onClick={async () => {
                    const response = await fetch("/api/style-packs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: newPackName.trim() || "Style Pack",
                      }),
                    });
                    if (response.ok) {
                      setNewPackName("");
                      await load();
                    }
                  }}
                >
                  New Style Pack
                </Button>
              </div>
            </div>
          </header>

          <div className="h-px w-full bg-slate-800" />

          {loading ? (
            <p className="text-sm text-slate-400">Loading style packs…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-slate-400">No saved style packs yet.</p>
          ) : (
            <section className="flex flex-col gap-5">
              {grouped.map(renderPack)}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
