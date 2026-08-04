import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CRON_SECRET, ALERT_GIORNI_PRIMA } from "@/lib/config";
import { sendEmail, scadenzaAlertEmail } from "@/lib/email";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";
import { resolveAlertDestinatari } from "@/lib/alert-recipients";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseDestinatari = await resolveAlertDestinatari();

  const scadenze = await prisma.scadenza.findMany({
    where: { confermata: true },
    include: {
      responsabile: { select: { id: true, email: true, name: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const scadenza of scadenze) {
    const giorni = giorniFinoScadenza(scadenza.dataScadenza);
    const match = ALERT_GIORNI_PRIMA.find((g) => giorni === g);
    if (!match) {
      skipped++;
      continue;
    }

    const already = await prisma.alertScadenza.findFirst({
      where: {
        scadenzaId: scadenza.id,
        giorniPrima: match,
        success: true,
        inviatoAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    const destinatari = new Map(
      baseDestinatari.map((d) => [d.email.toLowerCase(), d])
    );
    if (scadenza.responsabile) {
      destinatari.set(scadenza.responsabile.email.toLowerCase(), {
        email: scadenza.responsabile.email,
        name: scadenza.responsabile.name,
      });
    }

    const emails = [...destinatari.values()];

    let success = true;
    let error: string | null = null;

    for (const dest of emails) {
      const mail = scadenzaAlertEmail({
        destinatarioNome: dest.name,
        titolo: scadenza.titolo,
        dataScadenza: scadenza.dataScadenza.toLocaleDateString("it-IT"),
        giorniPrima: match,
        scadenzaId: scadenza.id,
        descrizione: scadenza.descrizione,
      });
      const ok = await sendEmail({
        to: dest.email,
        subject: mail.subject,
        html: mail.html,
      });
      if (!ok) {
        success = false;
        error = "Invio email fallito";
      }
    }

    await prisma.alertScadenza.create({
      data: {
        scadenzaId: scadenza.id,
        giorniPrima: match,
        destinatari: emails.map((e) => e.email),
        success,
        error,
      },
    });

    if (success) sent++;
  }

  return NextResponse.json({ sent, skipped, processed: scadenze.length });
}
