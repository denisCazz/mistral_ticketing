import type { Session } from "next-auth";
import type { StatoPratica } from "@prisma/client";
import { statiConsentitiPerUtente, statiTargetDisponibili } from "@/lib/constants";

type PraticaAccess = {
  operatoreId: string;
};

/** Filtro Prisma per le pratiche visibili all'utente della sessione. */
export function praticaWhereForSession(
  session: Session | null
): Record<string, unknown> {
  if (!session?.user?.id || !session.user.role) return { id: "__none__" };

  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "OPERATORE") {
    return { operatoreId: session.user.id };
  }
  return { id: "__none__" };
}

export function canSetStato(
  session: Session | null,
  stato: StatoPratica,
  statoCorrente?: StatoPratica
): boolean {
  if (!statoCorrente) {
    return statiConsentitiPerUtente(session?.user?.role).includes(stato);
  }
  return statiTargetDisponibili(
    session?.user?.role,
    statoCorrente
  ).includes(stato);
}

export function canManageStati(session: Session | null): boolean {
  if (!session?.user?.role) return false;
  return statiConsentitiPerUtente(session.user.role).length > 0;
}

/** Solo admin può assegnare/riassegnare l'operatore di una pratica. */
export function canAssignOperatore(session: Session | null): boolean {
  return session?.user?.role === "ADMIN";
}

export function canAccessPratica(
  session: Session | null,
  pratica: PraticaAccess
): boolean {
  if (!session?.user?.id || !session.user.role) return false;

  if (session.user.role === "ADMIN") return true;

  if (session.user.role === "OPERATORE") {
    return pratica.operatoreId === session.user.id;
  }

  return false;
}
