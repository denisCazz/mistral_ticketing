import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import {
  canAccessDocumento,
  canAccessDocumentiHr,
  documentiHrWhere,
} from "@/lib/access";

function session(role: "ADMIN" | "OPERATORE"): Session {
  return {
    user: { id: "u1", role, email: "a@b.it", name: "Test" },
    expires: "2099-01-01",
  };
}

describe("documenti access policy", () => {
  it("ADMIN può accedere a documenti HR e DIPENDENTE", () => {
    const s = session("ADMIN");
    expect(canAccessDocumentiHr(s)).toBe(true);
    expect(
      canAccessDocumento(s, { entityType: "DIPENDENTE", categoria: "UNILAV" })
    ).toBe(true);
    expect(
      canAccessDocumento(s, { entityType: "AZIENDA", categoria: "F24" })
    ).toBe(true);
  });

  it("OPERATORE non vede DIPENDENTE né categorie HR su altre entity", () => {
    const s = session("OPERATORE");
    expect(canAccessDocumentiHr(s)).toBe(false);
    expect(
      canAccessDocumento(s, { entityType: "DIPENDENTE", categoria: "FORMAZIONE" })
    ).toBe(false);
    expect(
      canAccessDocumento(s, { entityType: "AZIENDA", categoria: "UNILAV" })
    ).toBe(false);
    expect(
      canAccessDocumento(s, { entityType: "AZIENDA", categoria: "F24" })
    ).toBe(false);
    expect(
      canAccessDocumento(s, { entityType: "AUTOMEZZO", categoria: "ASSICURAZIONI" })
    ).toBe(true);
  });

  it("documentiHrWhere allinea filtro lista/RAG per non-HR", () => {
    expect(documentiHrWhere(true)).toEqual({});
    expect(documentiHrWhere(false)).toEqual({
      entityType: { not: "DIPENDENTE" },
      categoria: {
        notIn: ["UNILAV", "DOC", "IDONEITA", "F24", "DURC", "DURF"],
      },
    });
  });
});
