import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPratica } from "@/lib/access";
import { prisma } from "@/lib/db";
import { STATO_LABELS } from "@/lib/constants";
import { sollecitoEmail, sendEmail } from "@/lib/email";

// POST /api/pratiche/[id]/sollecito — invia sollecito email all'operatore assegnato.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const pratica = await prisma.pratica.findUnique({
    where: { id },
    include: {
      cliente: { select: { ragioneSociale: true } },
      operatore: { select: { name: true, email: true } },
    },
  });

  if (!pratica) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessPratica(session, pratica)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!pratica.operatore?.email) {
    return NextResponse.json(
      { error: "Nessuna email per l'operatore assegnato" },
      { status: 400 }
    );
  }

  const { subject, html } = sollecitoEmail({
    destinatarioNome: pratica.operatore.name,
    praticaId: pratica.id,
    numeroPratica: pratica.numeroPratica,
    cliente: pratica.cliente.ragioneSociale,
    stato: STATO_LABELS[pratica.stato],
  });

  const sent = await sendEmail({ to: pratica.operatore.email, subject, html });
  if (!sent) {
    return NextResponse.json(
      { error: "Invio email fallito (verifica RESEND_API_KEY)" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, to: pratica.operatore.email });
}
