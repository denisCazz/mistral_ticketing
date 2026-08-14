import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPreventivo } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isOpenAiConfigured } from "@/lib/openai";
import { runPreventivoAiGeneration } from "@/lib/preventivo-ai-run";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt obbligatorio" }, { status: 400 });
  }

  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: { cliente: true },
  });

  if (!preventivo) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, preventivo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runPreventivoAiGeneration({
      session,
      prompt,
      clienteId: preventivo.clienteId,
      preventivoId: id,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("generatePreventivoDraft failed:", error);
    return NextResponse.json(
      { error: "Errore generazione AI. Riprova tra poco." },
      { status: 502 }
    );
  }
}
