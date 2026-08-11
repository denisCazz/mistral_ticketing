import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/document-ai-admin", () => ({
  getDocumentAiAdminSnapshot: vi.fn(),
  executeDocumentAiAdminAction: vi.fn(),
  documentAiAdminActionSchema: { safeParse: vi.fn() },
}));
vi.mock("@/lib/document-similarity", () => ({
  getDocumentSimilarityGraph: vi.fn(),
}));

describe("document AI admin API security", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
  });

  it("rifiuta richieste anonime a coda e mappa", async () => {
    auth.mockResolvedValue(null);
    const adminRoute = await import("@/app/api/admin/documenti-ai/route");
    const mapRoute = await import(
      "@/app/api/admin/documenti-ai/map/route"
    );

    expect((await adminRoute.GET()).status).toBe(401);
    expect(
      (
        await mapRoute.GET(
          new Request("http://localhost/api/admin/documenti-ai/map")
        )
      ).status
    ).toBe(401);
  });

  it("rifiuta operatori non amministratori", async () => {
    auth.mockResolvedValue({
      user: { id: "u1", role: "OPERATORE" },
    });
    const adminRoute = await import("@/app/api/admin/documenti-ai/route");
    const mapRoute = await import(
      "@/app/api/admin/documenti-ai/map/route"
    );

    expect((await adminRoute.GET()).status).toBe(403);
    expect(
      (
        await mapRoute.GET(
          new Request("http://localhost/api/admin/documenti-ai/map")
        )
      ).status
    ).toBe(403);
  });
});
