import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentiAiAdminPage from "@/app/(app)/admin/documenti-ai/page";

describe("document AI map tab", () => {
  it("espone la mappa 3D senza caricare WebGL lato server", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentiAiAdminPage)
    );

    expect(html).toContain("Elaborazione");
    expect(html).toContain("Mappa 3D");
    expect(html).toContain("Esplora relazioni semantiche");
    expect(html).not.toContain("WebGLRenderingContext");
  });
});
