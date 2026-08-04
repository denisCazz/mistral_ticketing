import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { indexDocumentoChunks } from "@/lib/rag";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!doc.aiWhitelist) {
    return NextResponse.json(
      { error: "Documento non in whitelist AI" },
      { status: 400 }
    );
  }

  const count = await indexDocumentoChunks(id);
  return NextResponse.json({ indexedChunks: count });
}
