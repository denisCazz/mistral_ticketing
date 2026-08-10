import { randomBytes } from "crypto";

/** Password monouso casuale (mostrata una sola volta alla creazione). */
export function generateTemporaryPassword(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}
