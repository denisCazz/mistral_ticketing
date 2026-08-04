const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Mistral Impianti <noreply@mistralimpianti.it>";
const APP_URL = (
  process.env.NEXTAUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

function preventivoUrl(id: string): string {
  return `${APP_URL}/preventivi/${id}`;
}

function scadenzaUrl(id: string): string {
  return `${APP_URL}/scadenze?highlight=${id}`;
}

function actionButton(url: string, label: string): string {
  return `
    <p style="margin:24px 0">
      <a href="${url}" style="background:#0369a1;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;display:inline-block;font-weight:bold">${label}</a>
    </p>
    <p style="color:#888;font-size:12px">Oppure copia questo link: <a href="${url}" style="color:#0369a1">${url}</a></p>`;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailInput): Promise<boolean> {
  const destinatari = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (destinatari.length === 0) {
    console.warn(`[email] Nessun destinatario. Email non inviata: ${subject}`);
    return false;
  }
  if (!RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY mancante. Email a ${destinatari.join(", ")} non inviata: ${subject}`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: destinatari, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend errore ${res.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] invio fallito:", err);
    return false;
  }
}

function baseTemplate(titolo: string, corpo: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#0369a1;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:18px">Mistral Impianti</h2>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 8px 8px">
      <h3 style="margin-top:0">${titolo}</h3>
      ${corpo}
      <p style="color:#888;font-size:12px;margin-top:24px">Messaggio automatico — non rispondere a questa email.</p>
    </div>
  </div>`;
}

export function scadenzaAlertEmail(d: {
  destinatarioNome: string;
  titolo: string;
  dataScadenza: string;
  giorniPrima: number;
  scadenzaId: string;
  descrizione?: string | null;
}): { subject: string; html: string } {
  const url = scadenzaUrl(d.scadenzaId);
  const corpo = `
    <p>Ciao <strong>${d.destinatarioNome}</strong>,</p>
    <p>Scadenza in <strong>${d.giorniPrima}</strong> giorno/i.</p>
    <ul>
      <li><strong>Titolo:</strong> ${d.titolo}</li>
      <li><strong>Data scadenza:</strong> ${d.dataScadenza}</li>
      ${d.descrizione ? `<li><strong>Dettaglio:</strong> ${d.descrizione}</li>` : ""}
    </ul>
    ${actionButton(url, "Apri scadenziario")}`;
  return {
    subject: `[Scadenza] ${d.titolo} — ${d.giorniPrima} giorni`,
    html: baseTemplate("Alert scadenza", corpo),
  };
}

export function testAlertEmail(d: {
  destinatarioNome: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/configurazione`;
  const corpo = `
    <p>Ciao <strong>${d.destinatarioNome}</strong>,</p>
    <p>Questa è una <strong>email di test</strong> per verificare la configurazione degli alert scadenze.</p>
    <p>Se la ricevi, i destinatari e Resend sono configurati correttamente.</p>
    ${actionButton(url, "Apri configurazione")}`;
  return {
    subject: "[Test] Alert scadenze — Mistral Impianti",
    html: baseTemplate("Test alert scadenze", corpo),
  };
}

export function preventivoStatoEmail(d: {
  destinatarioNome: string;
  numeroPreventivo: string;
  cliente: string;
  statoDa: string;
  statoA: string;
  preventivoId: string;
}): { subject: string; html: string } {
  const url = preventivoUrl(d.preventivoId);
  const corpo = `
    <p>Ciao <strong>${d.destinatarioNome}</strong>,</p>
    <p>Il preventivo <strong>${d.numeroPreventivo}</strong> ha cambiato stato.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Da:</strong> ${d.statoDa}</li>
      <li><strong>A:</strong> ${d.statoA}</li>
    </ul>
    ${actionButton(url, "Apri preventivo")}`;
  return {
    subject: `[${d.numeroPreventivo}] Stato: ${d.statoA} — ${d.cliente}`,
    html: baseTemplate("Stato preventivo aggiornato", corpo),
  };
}
