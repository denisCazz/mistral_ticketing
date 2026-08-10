import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("security headers", () => {
  it("allows same-origin framing for document PDF preview", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeTypeOf("function");
    const rules = await headersFn!();
    const globalRule = rules.find((r) => r.source === "/:path*");
    expect(globalRule).toBeDefined();
    const frame = globalRule!.headers.find((h) => h.key === "X-Frame-Options");
    expect(frame?.value).toBe("SAMEORIGIN");
  });
});
