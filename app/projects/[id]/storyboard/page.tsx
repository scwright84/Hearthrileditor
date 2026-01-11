import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import StoryboardEditor from "./storyboard-editor";

export default async function ProjectStoryboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      audioAsset: true,
      transcript: { orderBy: { tSec: "asc" } },
      scenes: {
        orderBy: { index: "asc" },
        include: {
          imageCandidates: {
            where: { run: { isActive: true } },
            orderBy: { createdAt: "asc" },
          },
          animationClips: { orderBy: { createdAt: "asc" } },
        },
      },
      characters: {
        include: {
          omniRefs: true,
          omniVariants: { orderBy: { createdAt: "asc" } },
        },
      },
      stylePreset: true,
      stylePack: {
        include: {
          styleRefs: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!project) {
    redirect("/projects");
  }

  const stylePresets = await prisma.stylePreset.findMany({
    orderBy: { name: "asc" },
  });

  return <StoryboardEditor project={project} stylePresets={stylePresets} />;
}
