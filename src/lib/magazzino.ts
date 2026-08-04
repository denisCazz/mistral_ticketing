import { Prisma } from "@prisma/client";

export function toNum(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

export function serializeArticolo<
  T extends { quantita: Prisma.Decimal | number; sogliaMinima: Prisma.Decimal | number },
>(articolo: T) {
  return {
    ...articolo,
    quantita: toNum(articolo.quantita),
    sogliaMinima: toNum(articolo.sogliaMinima),
  };
}

export { isLowStock, looksLikeEan, normalizeScanCode } from "./magazzino-utils";
