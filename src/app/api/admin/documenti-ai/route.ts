import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  documentAiAdminActionSchema,
  executeDocumentAiAdminAction,
  getDocumentAiAdminSnapshot,
} from "@/lib/document-ai-admin";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getDocumentAiAdminSnapshot());
  } catch (error) {
    console.error("documenti-ai snapshot failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    const schemaMissing =
      /DocumentoAiJob|embeddingStatus|embeddingActiveProfile|does not exist|P2021|P2022/i.test(
        message
      );
    return NextResponse.json(
      {
        error: schemaMissing
          ? "Schema embedding v2 mancante sul database. Riavvia il container (sync all'avvio) o esegui npm run db:sync."
          : "Errore caricamento coda AI",
        details: message.slice(0, 500),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = documentAiAdminActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await executeDocumentAiAdminAction(parsed.data);
    const snapshot = await getDocumentAiAdminSnapshot();
    return NextResponse.json({ ...result, snapshot });
  } catch (error) {
    console.error("documenti-ai action failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Azione non riuscita",
        details: message.slice(0, 500),
      },
      { status: 500 }
    );
  }
}
