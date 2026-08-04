import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeAlertEmails } from "@/lib/alert-recipients";
import { sendEmail, testAlertEmail } from "@/lib/email";

async function resolveTestDestinatari(params: {
  emails: string[];
  includiAdmin: boolean;
}): Promise<Array<{ email: string; name: string }>> {
  const map = new Map<string, { email: string; name: string }>();

  for (const email of params.emails) {
    const key = email.trim().toLowerCase();
    if (!key) continue;
    map.set(key, { email: key, name: key });
  }

  if (params.includiAdmin) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { email: true, name: true },
    });
    for (const admin of admins) {
      const key = admin.email.trim().toLowerCase();
      map.set(key, { email: admin.email, name: admin.name });
    }
  }

  return [...map.values()];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const emails = normalizeAlertEmails(body.emails ?? []);
  if (emails === null) {
    return NextResponse.json(
      { error: "Elenco email non valido" },
      { status: 400 }
    );
  }

  const includiAdmin = Boolean(body.includiAdmin);
  if (!includiAdmin && emails.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nessun destinatario: aggiungi un'email o attiva gli admin",
      },
      { status: 400 }
    );
  }

  const destinatari = await resolveTestDestinatari({ emails, includiAdmin });
  if (destinatari.length === 0) {
    return NextResponse.json(
      { error: "Nessun destinatario trovato" },
      { status: 400 }
    );
  }

  const sent: string[] = [];
  const failed: string[] = [];

  for (const dest of destinatari) {
    const mail = testAlertEmail({ destinatarioNome: dest.name });
    const ok = await sendEmail({
      to: dest.email,
      subject: mail.subject,
      html: mail.html,
    });
    if (ok) sent.push(dest.email);
    else failed.push(dest.email);
  }

  if (sent.length === 0) {
    return NextResponse.json(
      {
        error: "Invio fallito per tutti i destinatari",
        failed,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    message:
      failed.length > 0
        ? `Inviata a ${sent.length}, fallita a ${failed.length}`
        : `Test inviato a ${sent.length} destinatari`,
  });
}
