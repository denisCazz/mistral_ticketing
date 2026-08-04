import type { Session } from "next-auth";
import type { StatoPreventivo } from "@prisma/client";
import {
  statiPreventivoConsentiti,
  statiPreventivoTarget,
} from "@/lib/preventivo-constants";

type PreventivoAccess = {
  operatoreId: string;
};

export function preventivoWhereForSession(
  session: Session | null
): Record<string, unknown> {
  if (!session?.user?.id || !session.user.role) return { id: "__none__" };
  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "OPERATORE") {
    return { operatoreId: session.user.id };
  }
  return { id: "__none__" };
}

export function canSetStatoPreventivo(
  session: Session | null,
  stato: StatoPreventivo,
  statoCorrente?: StatoPreventivo
): boolean {
  if (!statoCorrente) {
    return statiPreventivoConsentiti(session?.user?.role).includes(stato);
  }
  return statiPreventivoTarget(session?.user?.role, statoCorrente).includes(
    stato
  );
}

export function canManageStatiPreventivo(session: Session | null): boolean {
  if (!session?.user?.role) return false;
  return statiPreventivoConsentiti(session.user.role).length > 0;
}

export function canAssignOperatore(session: Session | null): boolean {
  return session?.user?.role === "ADMIN";
}

export function canAccessPreventivo(
  session: Session | null,
  preventivo: PreventivoAccess
): boolean {
  if (!session?.user?.id || !session.user.role) return false;
  if (session.user.role === "ADMIN") return true;
  if (session.user.role === "OPERATORE") {
    return preventivo.operatoreId === session.user.id;
  }
  return false;
}

export function canAccessDocumentiHr(session: Session | null): boolean {
  return session?.user?.role === "ADMIN";
}
