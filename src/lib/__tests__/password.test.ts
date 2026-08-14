import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { MIN_PASSWORD_LENGTH, passwordSchema } from "@/lib/password-policy";

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

describe("passwordSchema", () => {
  it("rifiuta password sotto i 12 caratteri", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("123456").success).toBe(false);
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it("accetta password di almeno 12 caratteri", () => {
    expect(passwordSchema.safeParse("dodici-chars").success).toBe(true);
  });
});

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
