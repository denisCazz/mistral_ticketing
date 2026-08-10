import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "@/lib/temporary-password";

describe("generateTemporaryPassword", () => {
  it("genera password casuali abbastanza lunghe e diverse", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(b.length).toBeGreaterThanOrEqual(12);
    expect(a).not.toBe(b);
    expect(a).not.toBe("Mistral1234");
  });
});
