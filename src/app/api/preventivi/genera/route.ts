import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpenAiConfigured } from "@/lib/openai";
import { runPreventivoAiGeneration } from "@/lib/preventivo-ai-run";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt obbligatorio" }, { status: 400 });
  }

  const clienteId = body.clienteId ? String(body.clienteId) : null;

  try {
    const result = await runPreventivoAiGeneration({
      session,
      prompt,
      clienteId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Cliente non trovato") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("generatePreventivoDraft failed:", error);
    return NextResponse.json(
      { error: "Errore generazione AI. Riprova tra poco." },
      { status: 502 }
    );
  }
}
