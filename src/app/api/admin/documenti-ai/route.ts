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

  return NextResponse.json(await getDocumentAiAdminSnapshot());
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

  const result = await executeDocumentAiAdminAction(parsed.data);
  const snapshot = await getDocumentAiAdminSnapshot();
  return NextResponse.json({ ...result, snapshot });
}
