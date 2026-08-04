import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildStorageKey,
  getPresignedUploadUrl,
  isR2Configured,
} from "@/lib/r2";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 non configurato" }, { status: 503 });
  }

  const body = await req.json();
  const entity = String(body.entity ?? "documenti");
  const entityId = String(body.entityId ?? "upload");
  const mimeType = String(body.mimeType ?? "application/octet-stream");
  const ext = String(body.ext ?? "bin").replace(/^\./, "");

  const key = buildStorageKey(entity, entityId, ext);
  const uploadUrl = await getPresignedUploadUrl(key, mimeType);

  return NextResponse.json({ key, uploadUrl });
}
