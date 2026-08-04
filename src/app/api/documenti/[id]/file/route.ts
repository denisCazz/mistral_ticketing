import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isR2Configured, streamFromR2 } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

function guessMime(mimeType: string, filename: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  return mimeType || "application/octet-stream";
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ()àèéìòùÀÈÉÌÒÙ]+/gi, "_").slice(0, 180) || "file";
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ error: "Storage non configurato" }, { status: 503 });
  }

  const { id } = await params;
  const documento = await prisma.documento.findUnique({
    where: { id },
    select: {
      storageKey: true,
      mimeType: true,
      titoloOriginale: true,
      entityType: true,
      sizeBytes: true,
    },
  });

  if (!documento) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  if (
    documento.entityType === "DIPENDENTE" &&
    !canAccessDocumentiHr(session)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { body, contentType, contentLength } = await streamFromR2(
      documento.storageKey
    );
    const mime = guessMime(
      contentType || documento.mimeType,
      documento.titoloOriginale
    );
    const filename = safeFilename(documento.titoloOriginale);

    return new NextResponse(body, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
        ...(contentLength != null
          ? { "Content-Length": String(contentLength) }
          : documento.sizeBytes
            ? { "Content-Length": String(documento.sizeBytes) }
            : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("document file proxy failed:", error);
    return NextResponse.json(
      { error: "Impossibile leggere il file" },
      { status: 502 }
    );
  }
}
