import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { createImageGeneration, getGeneration } from "@/lib/lumaClient";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const generation = await getGeneration(id);
  return NextResponse.json({ generation });
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }

  const model =
    body?.model === "photon-1" || body?.model === "photon-flash-1"
      ? body.model
      : "photon-flash-1";
  const sync = Boolean(body?.sync);
  const syncTimeout =
    typeof body?.syncTimeout === "number" ? body.syncTimeout : undefined;

  const generation = await createImageGeneration({
    prompt,
    model,
    aspect_ratio: "3:4",
    sync,
    sync_timeout: syncTimeout,
  });

  return NextResponse.json({ generation });
}
