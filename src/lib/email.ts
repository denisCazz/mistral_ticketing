const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Mistral Impianti <noreply@mistralimpianti.it>";
const APP_URL = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

function praticaUrl(praticaId: string): string {
  return `${APP_URL}/pratiche/${praticaId}`;
}

function praticaButton(praticaId: string): string {
  const url = praticaUrl(praticaId);
  return `
    <p style="margin:24px 0">
      <a href="${url}" style="background:#0369a1;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;display:inline-block;font-weight:bold">Apri la pratica</a>
    </p>
    <p style="color:#888;font-size:12px">Oppure copia questo link: <a href="${url}" style="color:#0369a1">${url}</a></p>`;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

// Invia email via Resend HTTP API. No-op se RESEND_API_KEY manca (log warn).
// `to` accetta uno o più destinatari (Resend supporta un array).
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const destinatari = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (destinatari.length === 0) {
    console.warn(`[email] Nessun destinatario. Email non inviata: ${subject}`);
    return false;
  }
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY mancante. Email a ${destinatari.join(", ")} non inviata: ${subject}`);
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

interface PraticaEmailBase {
  praticaId: string;
  numeroPratica: string;
  cliente: string;
  descrizione?: string | null;
}

interface CatEmailData extends PraticaEmailBase {
  catNome: string;
  stato: string;
  note?: string | null;
}

interface StatoCambiatoEmailData extends PraticaEmailBase {
  destinatarioNome: string;
  statoDa: string;
  statoA: string;
  changedByName: string;
  note?: string | null;
}

interface CatStatoCambiatoEmailData extends PraticaEmailBase {
  catNome: string;
  statoDa: string;
  statoA: string;
  changedByName: string;
  note?: string | null;
}

interface AssegnazioneEmailData extends PraticaEmailBase {
  stato: string;
  assegnatoDa: string;
  note?: string | null;
}

interface ManutentoreAssegnatoEmailData extends AssegnazioneEmailData {
  manutentoreNome: string;
}

interface CatAssegnatoEmailData extends AssegnazioneEmailData {
  catNome: string;
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

// Email cambio stato a operatore / manutentore.
export function praticaStatoCambiatoEmail(d: StatoCambiatoEmailData): { subject: string; html: string } {
  const corpo = `
    <p>Ciao <strong>${d.destinatarioNome}</strong>,</p>
    <p>La pratica <strong>${d.numeroPratica}</strong> ha cambiato stato.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Da:</strong> ${d.statoDa}</li>
      <li><strong>A:</strong> ${d.statoA}</li>
      <li><strong>Aggiornato da:</strong> ${d.changedByName}</li>
      ${d.descrizione ? `<li><strong>Descrizione:</strong> ${d.descrizione}</li>` : ""}
      ${d.note ? `<li><strong>Note:</strong> ${d.note}</li>` : ""}
    </ul>
    ${praticaButton(d.praticaId)}`;
  return {
    subject: `[${d.numeroPratica}] Stato aggiornato: ${d.statoA} — ${d.cliente}`,
    html: baseTemplate("Stato pratica aggiornato", corpo),
  };
}

// Email cambio stato al CAT.
export function catStatoCambiatoEmail(d: CatStatoCambiatoEmailData): { subject: string; html: string } {
  const corpo = `
    <p>Ciao <strong>${d.catNome}</strong>,</p>
    <p>La pratica <strong>${d.numeroPratica}</strong> assegnata al vostro centro ha cambiato stato.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Da:</strong> ${d.statoDa}</li>
      <li><strong>A:</strong> ${d.statoA}</li>
      <li><strong>Aggiornato da:</strong> ${d.changedByName}</li>
      ${d.descrizione ? `<li><strong>Descrizione:</strong> ${d.descrizione}</li>` : ""}
      ${d.note ? `<li><strong>Note:</strong> ${d.note}</li>` : ""}
    </ul>
    ${praticaButton(d.praticaId)}`;
  return {
    subject: `[${d.numeroPratica}] Stato aggiornato: ${d.statoA} — ${d.cliente}`,
    html: baseTemplate("Stato pratica aggiornato", corpo),
  };
}

// Email assegnazione pratica al manutentore.
export function manutentoreAssegnatoEmail(d: ManutentoreAssegnatoEmailData): { subject: string; html: string } {
  const corpo = `
    <p>Ciao <strong>${d.manutentoreNome}</strong>,</p>
    <p>Ti è stata assegnata la pratica <strong>${d.numeroPratica}</strong>.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Stato:</strong> ${d.stato}</li>
      <li><strong>Assegnata da:</strong> ${d.assegnatoDa}</li>
      ${d.descrizione ? `<li><strong>Descrizione:</strong> ${d.descrizione}</li>` : ""}
      ${d.note ? `<li><strong>Note:</strong> ${d.note}</li>` : ""}
    </ul>
    ${praticaButton(d.praticaId)}`;
  return {
    subject: `[${d.numeroPratica}] Pratica assegnata — ${d.cliente}`,
    html: baseTemplate("Nuova pratica assegnata", corpo),
  };
}

// Email assegnazione pratica al CAT.
export function catAssegnatoEmail(d: CatAssegnatoEmailData): { subject: string; html: string } {
  const corpo = `
    <p>Ciao <strong>${d.catNome}</strong>,</p>
    <p>Ti è stata assegnata la pratica <strong>${d.numeroPratica}</strong>.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Stato:</strong> ${d.stato}</li>
      <li><strong>Assegnata da:</strong> ${d.assegnatoDa}</li>
      ${d.descrizione ? `<li><strong>Descrizione:</strong> ${d.descrizione}</li>` : ""}
      ${d.note ? `<li><strong>Note:</strong> ${d.note}</li>` : ""}
    </ul>
    <p>Prendi in carico l'intervento appena possibile.</p>
    ${praticaButton(d.praticaId)}`;
  return {
    subject: `[${d.numeroPratica}] Nuova pratica assegnata — ${d.cliente}`,
    html: baseTemplate("Nuova pratica assegnata", corpo),
  };
}

// Retrocompatibilità: sollecito e vecchi riferimenti.
export function catPresaInCaricoEmail(d: CatEmailData): { subject: string; html: string } {
  return catAssegnatoEmail({ ...d, assegnatoDa: "Mistral Impianti" });
}

// Email sollecito al CAT.
export function catSollecitoEmail(d: CatEmailData): { subject: string; html: string } {
  const corpo = `
    <p>Ciao <strong>${d.catNome}</strong>,</p>
    <p>Sollecito sulla pratica <strong>${d.numeroPratica}</strong> ancora aperta.</p>
    <ul>
      <li><strong>Cliente:</strong> ${d.cliente}</li>
      <li><strong>Stato attuale:</strong> ${d.stato}</li>
      ${d.note ? `<li><strong>Note:</strong> ${d.note}</li>` : ""}
    </ul>
    <p>Ti chiediamo un aggiornamento sullo stato dell'intervento.</p>
    ${praticaButton(d.praticaId)}`;
  return {
    subject: `[${d.numeroPratica}] SOLLECITO — ${d.cliente}`,
    html: baseTemplate("Sollecito intervento", corpo),
  };
}
