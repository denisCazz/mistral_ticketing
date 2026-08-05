import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  buildStorageKey,
  getPresignedUploadUrl,
  isR2Configured,
} from "@/lib/r2";

const ALLOWED_ENTITIES = [
  "docs/azienda",
  "docs/dipendente",
  "docs/automezzo",
] as const;

const ALLOWED_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "doc",
  "docx",
  "rtf",
  "xls",
  "xlsx",
  "eml",
  "txt",
  "csv",
] as const;

const presignSchema = z.object({
  entity: z.enum(ALLOWED_ENTITIES),
  entityId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_-]+$/i, "entityId non valido"),
  mimeType: z.string().max(120),
  ext: z
    .string()
    .transform((value) => value.replace(/^\./, "").toLowerCase())
    .pipe(z.enum(ALLOWED_EXTENSIONS)),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 non configurato" }, { status: 503 });
  }

  const parsed = presignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const { entity, entityId, mimeType, ext } = parsed.data;

  const key = buildStorageKey(entity, entityId, ext);
  const uploadUrl = await getPresignedUploadUrl(key, mimeType);

  return NextResponse.json({ key, uploadUrl });
}
