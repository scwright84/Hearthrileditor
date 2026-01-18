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
      characters: true,
    },
  });

  if (!project) {
    redirect("/projects");
  }

  return <StoryboardEditor project={project} />;
}
