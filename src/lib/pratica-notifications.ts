import { StatoPratica } from "@prisma/client";
import { STATO_LABELS } from "@/lib/constants";
import {
  operatoreAssegnatoEmail,
  praticaStatoCambiatoEmail,
  sendEmail,
} from "@/lib/email";

export const praticaIncludeForNotify = {
  cliente: { select: { ragioneSociale: true } },
  operatore: { select: { id: true, name: true, email: true } },
} as const;

export type PraticaForNotify = {
  id: string;
  numeroPratica: string;
  descrizione?: string | null;
  stato: StatoPratica;
  operatoreId: string;
  cliente: { ragioneSociale: string };
  operatore: { id: string; name: string; email: string };
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

  return recipients;
}

function notifyStatoCambiato({
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
}

function notifyAssegnazioni({
  before,
  after,
  changedByName,
  note,
}: NotifyPraticaChangesInput) {
  const base = emailBase(after);

  if (
    after.operatoreId !== before.operatoreId &&
    after.operatore?.email
  ) {
    const { subject, html } = operatoreAssegnatoEmail({
      ...base,
      operatoreNome: after.operatore.name,
      stato: STATO_LABELS[after.stato],
      assegnatoDa: changedByName,
      note,
    });
    sendFireAndForget(after.operatore.email, subject, html);
  }
}

/** Invia email per cambio stato e/o nuove assegnazioni (fire-and-forget). */
export function notifyPraticaChanges(input: NotifyPraticaChangesInput): void {
  notifyStatoCambiato(input);
  notifyAssegnazioni(input);
}
