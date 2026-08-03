import { StatoPratica } from "@prisma/client";
import { STATO_LABELS } from "@/lib/constants";
import {
  catAssegnatoEmail,
  catStatoCambiatoEmail,
  manutentoreAssegnatoEmail,
  praticaStatoCambiatoEmail,
  sendEmail,
} from "@/lib/email";

export const praticaIncludeForNotify = {
  cliente: { select: { ragioneSociale: true } },
  operatore: { select: { id: true, name: true, email: true } },
  manutentore: { select: { id: true, name: true, email: true } },
  cat: { select: { id: true, ragioneSociale: true, emails: true } },
} as const;

export type PraticaForNotify = {
  id: string;
  numeroPratica: string;
  descrizione?: string | null;
  stato: StatoPratica;
  catId?: string | null;
  manutentoreId?: string | null;
  cliente: { ragioneSociale: string };
  operatore: { id: string; name: string; email: string };
  manutentore?: { id: string; name: string; email: string } | null;
  cat?: { id: string; ragioneSociale: string; emails: string[] } | null;
};

interface NotifyPraticaChangesInput {
  before: PraticaForNotify;
  after: PraticaForNotify;
  statoDa: StatoPratica | null;
  statoA: StatoPratica;
  changedByName: string;
  changedByEmail?: string | null;
  note?: string | null;
}

function emailBase(after: PraticaForNotify) {
  return {
    praticaId: after.id,
    numeroPratica: after.numeroPratica,
    cliente: after.cliente.ragioneSociale,
    descrizione: after.descrizione,
  };
}

function sendFireAndForget(to: string | string[], subject: string, html: string) {
  void sendEmail({ to, subject, html });
}

function collectStatusRecipients(
  after: PraticaForNotify,
  excludeEmail?: string | null
): { email: string; nome: string }[] {
  const seen = new Set<string>();
  const recipients: { email: string; nome: string }[] = [];

  const add = (email: string | undefined | null, nome: string) => {
    if (!email || email === excludeEmail || seen.has(email)) return;
    seen.add(email);
    recipients.push({ email, nome });
  };

  add(after.operatore.email, after.operatore.name);
  add(after.manutentore?.email, after.manutentore?.name ?? "Manutentore");

  return recipients;
}

function notifyStatoCambiato({
  before,
  after,
  statoDa,
  statoA,
  changedByName,
  changedByEmail,
  note,
}: NotifyPraticaChangesInput) {
  if (statoDa === statoA) return;

  const base = emailBase(after);
  const statoDaLabel = statoDa ? STATO_LABELS[statoDa] : "—";
  const statoALabel = STATO_LABELS[statoA];

  for (const { email, nome } of collectStatusRecipients(after, changedByEmail)) {
    const { subject, html } = praticaStatoCambiatoEmail({
      ...base,
      destinatarioNome: nome,
      statoDa: statoDaLabel,
      statoA: statoALabel,
      changedByName,
      note,
    });
    sendFireAndForget(email, subject, html);
  }

  if (after.cat?.emails?.length) {
    const { subject, html } = catStatoCambiatoEmail({
      ...base,
      catNome: after.cat.ragioneSociale,
      statoDa: statoDaLabel,
      statoA: statoALabel,
      changedByName,
      note,
    });
    sendFireAndForget(after.cat.emails, subject, html);
  }
}

function notifyAssegnazioni({
  before,
  after,
  changedByName,
  note,
}: NotifyPraticaChangesInput) {
  const base = emailBase(after);

  if (after.catId && after.catId !== before.catId && after.cat?.emails?.length) {
    const { subject, html } = catAssegnatoEmail({
      ...base,
      catNome: after.cat.ragioneSociale,
      stato: STATO_LABELS[after.stato],
      assegnatoDa: changedByName,
      note,
    });
    sendFireAndForget(after.cat.emails, subject, html);
  }

  if (
    after.manutentoreId &&
    after.manutentoreId !== before.manutentoreId &&
    after.manutentore?.email
  ) {
    const { subject, html } = manutentoreAssegnatoEmail({
      ...base,
      manutentoreNome: after.manutentore.name,
      stato: STATO_LABELS[after.stato],
      assegnatoDa: changedByName,
      note,
    });
    sendFireAndForget(after.manutentore.email, subject, html);
  }
}

/** Invia email per cambio stato e/o nuove assegnazioni (fire-and-forget). */
export function notifyPraticaChanges(input: NotifyPraticaChangesInput): void {
  notifyStatoCambiato(input);
  notifyAssegnazioni(input);
}
