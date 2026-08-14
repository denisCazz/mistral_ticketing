import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, prisma, enqueueDocumentAiJob } = vi.hoisted(() => ({
  auth: vi.fn(),
  enqueueDocumentAiJob: vi.fn(),
  prisma: {
    documento: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/document-ai-jobs", () => ({ enqueueDocumentAiJob }));

describe("documenti scadenza-ai POST", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    enqueueDocumentAiJob.mockReset();
    prisma.documento.findMany.mockReset();
    enqueueDocumentAiJob.mockResolvedValue("job1");
  });

  it("rifiuta OPERATORE", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "OPERATORE" } });
    const { POST } = await import("@/app/api/documenti/scadenza-ai/route");
    const res = await POST(
      new Request("http://localhost/api/documenti/scadenza-ai", {
        method: "POST",
        body: JSON.stringify({ ids: ["d1"] }),
      })
    );
    expect(res.status).toBe(403);
    expect(enqueueDocumentAiJob).not.toHaveBeenCalled();
  });

  it("accoda FULL_PIPELINE per i documenti ammessi", async () => {
    auth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
    prisma.documento.findMany.mockResolvedValue([
      { id: "d1", entityType: "AUTOMEZZO", categoria: "ASSICURAZIONI", extractionAt: null },
    ]);
    const { POST } = await import("@/app/api/documenti/scadenza-ai/route");
    const res = await POST(
      new Request("http://localhost/api/documenti/scadenza-ai", {
        method: "POST",
        body: JSON.stringify({ ids: ["d1", "d1"] }),
      })
    );
    expect(res.status).toBe(200);
    expect(enqueueDocumentAiJob).toHaveBeenCalledWith({
      documentoId: "d1",
      type: "FULL_PIPELINE",
    });
    const body = await res.json();
    expect(body.queued).toBe(1);
  });
});
