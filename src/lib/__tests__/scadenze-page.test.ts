import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ScadenzePage from "@/app/(app)/scadenze/page";

describe("scadenze page", () => {
  it("renderizza il fallback suspense senza crashare", () => {
    const html = renderToStaticMarkup(createElement(ScadenzePage));
    expect(html).toContain("animate-spin");
  });
});
