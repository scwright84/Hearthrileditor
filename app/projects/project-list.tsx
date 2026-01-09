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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#e2e8f0_35%,_#d1d9f7_100%)] px-8 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              HearthRail
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
              Projects
            </h1>
          </div>
          <div className="flex w-full max-w-md items-center gap-3">
            <Input
              placeholder="New project title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button
              disabled={!title || isCreating}
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
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {projects.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-lg">No projects yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Create your first HearthRail pipeline project to get started.
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}/edit`}>
                <Card className="transition hover:-translate-y-1 hover:shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">{project.title}</CardTitle>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Last updated{" "}
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Open timeline, transcript, storyboard, and renders.
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
