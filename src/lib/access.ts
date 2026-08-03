import type { Session } from "next-auth";
import type { StatoPratica } from "@prisma/client";
import { statiConsentitiPerUtente, statiTargetDisponibili } from "@/lib/constants";

type PraticaAccess = {
  catId: string | null;
  manutentoreId?: string | null;
};

export function isCatUser(session: Session | null): boolean {
  return Boolean(session?.user?.catId);
}

export function canSetStato(
  session: Session | null,
  stato: StatoPratica,
  statoCorrente?: StatoPratica
): boolean {
  if (!statoCorrente) {
    return statiConsentitiPerUtente(
      session?.user?.role,
      session?.user?.catId
    ).includes(stato);
  }
  return statiTargetDisponibili(
    session?.user?.role,
    session?.user?.catId,
    statoCorrente
  ).includes(stato);
}

export function canManageStati(session: Session | null): boolean {
  if (!session?.user?.role) return false;
  if (session.user.catId) return true;
  if (session.user.role === "MANUTENTORE") return false;
  return statiConsentitiPerUtente(session.user.role, session.user.catId).length > 0;
}

export function canAccessPratica(
  session: Session | null,
  pratica: PraticaAccess
): boolean {
  if (!session?.user) return false;

  if (session.user.catId) {
    return pratica.catId === session.user.catId;
  }

  if (session.user.role === "MANUTENTORE") {
    return pratica.manutentoreId === session.user.id;
  }

  return true;
}
