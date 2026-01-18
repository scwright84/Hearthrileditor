"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Project = {
  id: string;
  title: string;
  updatedAt: string | Date;
};

export default function ProjectList({ projects }: { projects: Project[] }) {
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_55%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-14">
        <aside className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-4 self-start rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 sm:flex">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Hearthril
          </p>
          <Link
            href="/projects"
            className="text-sm font-medium text-slate-100 underline underline-offset-4"
          >
            Projects
          </Link>
          <Link
            href="/animation-styles"
            className="text-sm font-medium text-slate-300 hover:text-slate-100"
          >
            Animation Library
          </Link>
        </aside>

        <div className="flex w-full flex-col gap-8">
          <header className="flex flex-col gap-6">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-100">
                Projects
              </h1>
            </div>
            <div className="flex w-full items-center">
              <div className="flex w-full max-w-lg flex-col items-start gap-3">
                <p className="text-sm text-slate-400">
                  Name your project to get started.
                </p>
                <Input
                  placeholder="New project title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-12 border-slate-700 bg-slate-900/80 text-base text-slate-100 placeholder:text-slate-500 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-500"
                />
                <Button
                  disabled={!title || isCreating}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                  onClick={async () => {
                    setIsCreating(true);
                    const response = await fetch("/api/projects", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title }),
                    });
                    const data = await response.json();
                    setIsCreating(false);
                    if (data?.id) {
                      window.location.href = `/projects/${data.id}/edit`;
                    }
                  }}
                >
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </header>

          <div className="h-px w-full bg-slate-800" />

          <section className="grid gap-6 md:grid-cols-2">
            {projects.length === 0 ? (
            <Card className="border-dashed border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  No projects yet
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-400">
                Create your first Hearthril pipeline project to get started.
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Card
                key={project.id}
                className="flex h-full flex-col justify-between border-slate-800 bg-slate-900/60 text-slate-100 transition hover:-translate-y-1 hover:border-slate-700 hover:shadow-lg"
              >
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link
                      href={`/projects/${project.id}/edit`}
                      className="hover:underline"
                    >
                      {project.title}
                    </Link>
                  </CardTitle>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Last updated {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </CardHeader>
                <CardContent className="text-sm text-slate-400">
                  <p>Open timeline, transcript, storyboard, and renders.</p>
                  <div className="mt-4 flex items-center gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/projects/${project.id}/edit`}>Open</Link>
                    </Button>
                    {pendingDeleteId === project.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Delete project?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === project.id}
                          onClick={async () => {
                            setDeletingId(project.id);
                            const response = await fetch(
                              `/api/projects/${project.id}`,
                              { method: "DELETE" },
                            );
                            setDeletingId(null);
                            setPendingDeleteId(null);
                            if (response.ok) {
                              window.location.reload();
                            }
                          }}
                        >
                          {deletingId === project.id ? "Deleting..." : "Confirm"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === project.id}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingDeleteId(project.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          </section>
        </div>
      </div>
    </div>
  );
}
