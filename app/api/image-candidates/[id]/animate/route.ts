import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { getMidjourneyProvider } from "@/lib/midjourney";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await prisma.imageCandidate.findFirst({
    where: { id: params.id, scene: { project: { userId: session.user.id } } },
    include: { scene: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  publishProjectEvent(candidate.scene.projectId, { message: "Animating clip" });

  try {
    const provider = getMidjourneyProvider();
    const result = await provider.animate({
      imageUrl: candidate.url,
      motion: "low",
    });

    const clip = await prisma.animationClip.create({
      data: {
        sceneId: candidate.sceneId,
        imageCandidateId: candidate.id,
        providerJobId: result.jobId,
        url: result.videoUrl,
        durationSec: result.durationSec,
      },
    });

    publishProjectEvent(candidate.scene.projectId, { message: "Animation ready" });

    return NextResponse.json(clip);
  } catch (error) {
    publishProjectEvent(candidate.scene.projectId, { message: "Animation failed" });
    console.error(error);
    return NextResponse.json({ error: "Animation failed" }, { status: 500 });
  }
}
