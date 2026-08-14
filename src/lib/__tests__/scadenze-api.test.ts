import { beforeEach, describe, expect, it, vi } from "vitest";
import { inizioGiornoLocale } from "@/lib/scadenza-agenda";

const { auth, prisma } = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    scadenza: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ prisma }));

const admin = { user: { id: "a1", role: "ADMIN" } };
const operatore = { user: { id: "u1", role: "OPERATORE" } };

describe("scadenze GET", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    prisma.scadenza.findMany.mockReset();
    prisma.scadenza.findFirst.mockReset();
    prisma.scadenza.count.mockReset();
    prisma.scadenza.findMany.mockResolvedValue([]);
    prisma.scadenza.findFirst.mockResolvedValue(null);
    prisma.scadenza.count.mockResolvedValue(0);
  });

  it("rifiuta anonimi", async () => {
    auth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/scadenze/route");
    const res = await GET(new Request("http://localhost/api/scadenze"));
    expect(res.status).toBe(401);
  });

  it("usa l'inizio giornata e include le scadute, non Date.now()", async () => {
    auth.mockResolvedValue(admin);
    const { GET } = await import("@/app/api/scadenze/route");
    await GET(
      new Request("http://localhost/api/scadenze?giorni=90&passate=90&confermate=false")
    );

    expect(prisma.scadenza.findMany).toHaveBeenCalled();
    const arg = prisma.scadenza.findMany.mock.calls[0][0];
    const start = inizioGiornoLocale();
    expect(arg.where.dataScadenza.gte.getTime()).toBeLessThan(start.getTime());
    expect(arg.where.dataScadenza.lte.getTime()).toBeGreaterThan(start.getTime());
    expect(arg.where.confermata).toBeUndefined();

    const scaduteWhere = prisma.scadenza.count.mock.calls[0][0].where;
    expect(scaduteWhere.dataScadenza.lt.getTime()).toBe(start.getTime());
  });

  it("filtra l'OPERATORE sulle sole scadenze assegnate", async () => {
    auth.mockResolvedValue(operatore);
    const { GET } = await import("@/app/api/scadenze/route");
    await GET(new Request("http://localhost/api/scadenze?confermate=false"));
    const arg = prisma.scadenza.findMany.mock.calls[0][0];
    expect(arg.where.responsabileId).toBe("u1");
  });

  it("con countsOnly non carica l'elenco", async () => {
    auth.mockResolvedValue(admin);
    prisma.scadenza.count.mockResolvedValue(4);
    const { GET } = await import("@/app/api/scadenze/route");
    const res = await GET(
      new Request("http://localhost/api/scadenze?countsOnly=1&confermate=false")
    );
    expect(prisma.scadenza.findMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.scadenze).toEqual([]);
    expect(body.counts.scadute).toBe(4);
  });
});
