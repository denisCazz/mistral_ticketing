import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, prisma, deleteFromR2 } = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteFromR2: vi.fn(),
  prisma: {
    documento: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    scadenza: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    aziendaSettings: { findUnique: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/r2", () => ({
  getPresignedDownloadUrl: vi.fn(),
  deleteFromR2,
}));

const operatore = { user: { id: "u1", role: "OPERATORE" } };
const admin = { user: { id: "a1", role: "ADMIN" } };

describe("extract GET access", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    prisma.documento.findUnique.mockReset();
  });

  it("rifiuta anonimi", async () => {
    auth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/documenti/[id]/extract/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(401);
  });

  it("rifiuta OPERATORE su documento HR", async () => {
    auth.mockResolvedValue(operatore);
    prisma.documento.findUnique.mockResolvedValue({
      id: "d1",
      titoloOriginale: "UNILAV.pdf",
      extractionJson: { cf: "secret" },
      extractionAt: new Date(),
      dataScadenza: null,
      scadenzaConfidence: null,
      scadenzaSource: null,
      scadenzaRaw: null,
      statoValidita: "VALIDO",
      nonServeScadenza: false,
      dipendenteId: "dip1",
      automezzoId: null,
      entityType: "DIPENDENTE",
      categoria: "UNILAV",
    });
    const { GET } = await import("@/app/api/documenti/[id]/extract/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(403);
  });

  it("consente OPERATORE su documento automezzo", async () => {
    auth.mockResolvedValue(operatore);
    prisma.documento.findUnique.mockResolvedValue({
      id: "d2",
      titoloOriginale: "assicurazione.pdf",
      extractionJson: { targa: "AB123CD" },
      extractionAt: new Date(),
      dataScadenza: null,
      scadenzaConfidence: null,
      scadenzaSource: null,
      scadenzaRaw: null,
      statoValidita: "VALIDO",
      nonServeScadenza: false,
      dipendenteId: null,
      automezzoId: "auto1",
      entityType: "AUTOMEZZO",
      categoria: "ASSICURAZIONI",
    });
    const { GET } = await import("@/app/api/documenti/[id]/extract/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extractionJson).toEqual({ targa: "AB123CD" });
    expect(body.entityType).toBeUndefined();
  });
});

describe("scadenze PUT access", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    prisma.scadenza.findUnique.mockReset();
    prisma.scadenza.update.mockReset();
    prisma.documento.update.mockReset();
  });

  it("impedisce all'OPERATORE di riassegnare il responsabile", async () => {
    auth.mockResolvedValue(operatore);
    prisma.scadenza.findUnique.mockResolvedValue({
      id: "s1",
      titolo: "Assicurazione",
      descrizione: null,
      dataScadenza: new Date("2026-12-01"),
      confermata: false,
      responsabileId: "u1",
      fonte: "FILENAME",
      documentoId: null,
    });
    const { PUT } = await import("@/app/api/scadenze/[id]/route");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ responsabileId: "other" }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(403);
    expect(prisma.scadenza.update).not.toHaveBeenCalled();
  });

  it("consente all'OPERATORE di confermare la propria scadenza", async () => {
    auth.mockResolvedValue(operatore);
    const existing = {
      id: "s1",
      titolo: "Assicurazione",
      descrizione: null,
      dataScadenza: new Date("2026-12-01"),
      confermata: false,
      responsabileId: "u1",
      fonte: "FILENAME",
      documentoId: null,
    };
    prisma.scadenza.findUnique.mockResolvedValue(existing);
    prisma.scadenza.update.mockResolvedValue({ ...existing, confermata: true });
    const { PUT } = await import("@/app/api/scadenze/[id]/route");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ confermata: true }),
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.scadenza.update).toHaveBeenCalled();
  });
});

describe("magazzino write access", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
  });

  it("rifiuta POST catalogo all'OPERATORE", async () => {
    auth.mockResolvedValue(operatore);
    const { POST } = await import("@/app/api/magazzino/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ codice: "X", nome: "Vite" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("rifiuta PATCH catalogo all'OPERATORE", async () => {
    auth.mockResolvedValue(operatore);
    const { PATCH } = await import("@/app/api/magazzino/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ nome: "Altro" }),
      }),
      { params: Promise.resolve({ id: "art1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("rifiuta RETTIFICA all'OPERATORE", async () => {
    auth.mockResolvedValue(operatore);
    const { POST } = await import("@/app/api/magazzino/movimenti/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          articoloId: "art1",
          tipo: "RETTIFICA",
          quantita: 99,
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("settings e utenti disclosure", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    prisma.aziendaSettings.findUnique.mockReset();
    prisma.user.findMany.mockReset();
  });

  it("non espone costi e alertEmails all'OPERATORE", async () => {
    auth.mockResolvedValue(operatore);
    prisma.aziendaSettings.findUnique.mockResolvedValue({
      id: "default",
      nomeAzienda: "Mistral Impianti",
      logo: null,
      indirizzo: "Via Roma",
      partitaIva: "123",
      codiceFiscale: null,
      pec: null,
      codiceDestinatarioSdi: null,
      telefono: null,
      email: "info@example.com",
      costoGiornata: 180,
      alertEmails: ["admin@example.com"],
      alertIncludiAdmin: true,
    });
    const { GET } = await import("@/app/api/settings/azienda/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nomeAzienda).toBe("Mistral Impianti");
    expect(body.costoGiornata).toBeUndefined();
    expect(body.alertEmails).toBeUndefined();
  });

  it("restituisce id e nome su assegnabili, senza email", async () => {
    auth.mockResolvedValue(operatore);
    prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Mario" }]);
    const { GET } = await import("@/app/api/utenti/route");
    const res = await GET(
      new Request("http://localhost/api/utenti?assegnabili=1")
    );
    expect(res.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true },
      })
    );
    expect(await res.json()).toEqual([{ id: "u1", name: "Mario" }]);
  });

  it("ADMIN riceve i costi aziendali", async () => {
    auth.mockResolvedValue(admin);
    prisma.aziendaSettings.findUnique.mockResolvedValue({
      id: "default",
      nomeAzienda: "Mistral Impianti",
      logo: null,
      indirizzo: null,
      partitaIva: null,
      codiceFiscale: null,
      pec: null,
      codiceDestinatarioSdi: null,
      telefono: null,
      email: null,
      costoGiornata: 180,
      alertEmails: ["admin@example.com"],
      alertIncludiAdmin: true,
    });
    const { GET } = await import("@/app/api/settings/azienda/route");
    const body = await (await GET()).json();
    expect(body.costoGiornata).toBe(180);
    expect(body.alertEmails).toEqual(["admin@example.com"]);
  });
});

describe("documenti DELETE access", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    deleteFromR2.mockReset();
    prisma.documento.findUnique.mockReset();
    prisma.documento.findMany.mockReset();
    prisma.documento.delete.mockReset();
    prisma.documento.deleteMany.mockReset();
    prisma.scadenza.deleteMany.mockReset();
  });

  it("rifiuta richieste anonime", async () => {
    auth.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/documenti/[id]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(401);
    expect(prisma.documento.deleteMany).not.toHaveBeenCalled();
  });

  it("rifiuta OPERATORE", async () => {
    auth.mockResolvedValue(operatore);
    const { DELETE } = await import("@/app/api/documenti/[id]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(403);
    expect(prisma.documento.findUnique).not.toHaveBeenCalled();
    expect(prisma.documento.deleteMany).not.toHaveBeenCalled();
  });

  it("restituisce 404 se il documento non esiste", async () => {
    auth.mockResolvedValue(admin);
    prisma.documento.findUnique.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/documenti/[id]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(prisma.documento.deleteMany).not.toHaveBeenCalled();
  });

  it("consente all'ADMIN di eliminare documento, scadenze e file", async () => {
    auth.mockResolvedValue(admin);
    prisma.documento.findUnique.mockResolvedValue({
      id: "d1",
      storageKey: "azienda/x/file.pdf",
      entityType: "AZIENDA",
      categoria: "CCIAA",
    });
    prisma.scadenza.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documento.deleteMany.mockResolvedValue({ count: 1 });
    deleteFromR2.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/documenti/[id]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "d1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.scadenza.deleteMany).toHaveBeenCalledWith({
      where: { documentoId: { in: ["d1"] } },
    });
    expect(prisma.documento.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["d1"] } },
    });
    expect(deleteFromR2).toHaveBeenCalledWith("azienda/x/file.pdf");
  });
});

describe("documenti bulk DELETE access", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    deleteFromR2.mockReset();
    prisma.documento.findMany.mockReset();
    prisma.documento.deleteMany.mockReset();
    prisma.scadenza.deleteMany.mockReset();
  });

  it("rifiuta OPERATORE sulla cancellazione multipla", async () => {
    auth.mockResolvedValue(operatore);
    const { DELETE } = await import("@/app/api/documenti/route");
    const res = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ ids: ["d1", "d2"] }),
      })
    );
    expect(res.status).toBe(403);
    expect(prisma.documento.findMany).not.toHaveBeenCalled();
  });

  it("consente all'ADMIN di eliminare più documenti", async () => {
    auth.mockResolvedValue(admin);
    prisma.documento.findMany.mockResolvedValue([
      {
        id: "d1",
        storageKey: "azienda/x/a.pdf",
        entityType: "AZIENDA",
        categoria: "CCIAA",
      },
      {
        id: "d2",
        storageKey: "azienda/x/b.pdf",
        entityType: "AZIENDA",
        categoria: "DURC",
      },
    ]);
    prisma.scadenza.deleteMany.mockResolvedValue({ count: 0 });
    prisma.documento.deleteMany.mockResolvedValue({ count: 2 });
    deleteFromR2.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/documenti/route");
    const res = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["d1", "d2"] }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: 2,
      requested: 2,
    });
    expect(prisma.documento.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["d1", "d2"] } },
    });
    expect(deleteFromR2).toHaveBeenCalledTimes(2);
  });
});
