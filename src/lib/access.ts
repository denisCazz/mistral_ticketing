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

export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "ADMIN";
}

export function canAccessDocumentiHr(session: Session | null): boolean {
  return isAdmin(session);
}

export function canManageMagazzino(session: Session | null): boolean {
  return isAdmin(session);
}

export function canRettificaMagazzino(session: Session | null): boolean {
  return isAdmin(session);
}

export function canAccessScadenza(
  session: Session | null,
  scadenza: { responsabileId: string | null }
): boolean {
  if (!session?.user?.id || !session.user.role) return false;
  if (isAdmin(session)) return true;
  if (session.user.role === "OPERATORE") {
    return scadenza.responsabileId === session.user.id;
  }
  return false;
}

export function canAssignScadenzaResponsabile(session: Session | null): boolean {
  return isAdmin(session);
}

/** Categorie riservate HR (allineate a lista / dettaglio / file / RAG). */
export const DOCUMENTI_HR_CATEGORIE = [
  "UNILAV",
  "DOC",
  "IDONEITA",
  "F24",
  "DURC",
  "DURF",
] as const;

type DocumentoAccess = {
  entityType: string;
  categoria: string;
};

/** Filtro Prisma per escludere documenti HR quando l'utente non può accedervi. */
export function documentiHrWhere(canHr: boolean): Record<string, unknown> {
  if (canHr) return {};
  return {
    entityType: { not: "DIPENDENTE" },
    categoria: {
      notIn: [...DOCUMENTI_HR_CATEGORIE],
    },
  };
}

/** Policy unica: lista, dettaglio, file e RAG devono usare questa. */
export function canAccessDocumento(
  session: Session | null,
  documento: DocumentoAccess
): boolean {
  if (!session?.user?.role) return false;
  if (canAccessDocumentiHr(session)) return true;
  if (documento.entityType === "DIPENDENTE") return false;
  return !(DOCUMENTI_HR_CATEGORIE as readonly string[]).includes(
    documento.categoria
  );
}
