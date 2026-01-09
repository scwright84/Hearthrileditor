import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ProjectEditor from "./project-editor";

export default async function ProjectEditPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      audioAsset: true,
      transcript: { orderBy: { tSec: "asc" } },
      scenes: {
        orderBy: { index: "asc" },
        include: {
          imageCandidates: true,
          animationClips: true,
        },
      },
      characters: true,
      stylePreset: true,
    },
  });

  if (!project) {
    redirect("/projects");
  }

  const stylePresets = await prisma.stylePreset.findMany({
    orderBy: { name: "asc" },
  });

  return <ProjectEditor project={project} stylePresets={stylePresets} />;
}
