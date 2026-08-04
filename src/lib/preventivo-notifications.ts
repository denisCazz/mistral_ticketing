import { sendEmail, preventivoStatoEmail } from "@/lib/email";
import { STATO_PREVENTIVO_LABELS } from "@/lib/preventivo-constants";
import type { StatoPreventivo } from "@prisma/client";

export const preventivoIncludeForNotify = {
  cliente: { select: { ragioneSociale: true } },
  operatore: { select: { id: true, name: true, email: true } },
};

export type PreventivoForNotify = {
  id: string;
  numeroPreventivo: string;
  operatoreId: string;
  cliente: { ragioneSociale: string };
  operatore: { id: string; name: string; email: string };
};

export function notifyPreventivoStatoChange(params: {
  preventivo: PreventivoForNotify;
  statoDa: StatoPreventivo | null;
  statoA: StatoPreventivo;
}): void {
  const { preventivo, statoDa, statoA } = params;
  const email = preventivoStatoEmail({
    destinatarioNome: preventivo.operatore.name,
    numeroPreventivo: preventivo.numeroPreventivo,
    cliente: preventivo.cliente.ragioneSociale,
    statoDa: statoDa ? STATO_PREVENTIVO_LABELS[statoDa] : "—",
    statoA: STATO_PREVENTIVO_LABELS[statoA],
    preventivoId: preventivo.id,
  });

  void sendEmail({
    to: preventivo.operatore.email,
    subject: email.subject,
    html: email.html,
  });
}
