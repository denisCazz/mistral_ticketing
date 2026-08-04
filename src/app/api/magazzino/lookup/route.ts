import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { looksLikeEan, normalizeScanCode, serializeArticolo } from "@/lib/magazzino";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("code") ?? "";
  const code = normalizeScanCode(raw);

  if (!code) {
    return NextResponse.json({ error: "Codice mancante" }, { status: 400 });
  }

  const where = looksLikeEan(code)
    ? {
        OR: [
          { ean: code },
          { codice: { equals: code, mode: "insensitive" as const } },
        ],
      }
    : {
        OR: [
          { codice: { equals: code, mode: "insensitive" as const } },
          { ean: code },
        ],
      };

  const articolo = await prisma.articolo.findFirst({ where });

  if (!articolo) {
    return NextResponse.json({
      found: false,
      code,
      suggestedField: looksLikeEan(code) ? "ean" : "codice",
    });
  }

  return NextResponse.json({
    found: true,
    code,
    articolo: serializeArticolo(articolo),
  });
}
