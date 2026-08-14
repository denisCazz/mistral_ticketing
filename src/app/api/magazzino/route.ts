import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMagazzino } from "@/lib/access";
import { prisma } from "@/lib/db";
import { serializeArticolo } from "@/lib/magazzino";
import { z } from "zod";

const createSchema = z.object({
  codice: z.string().trim().min(1).max(64),
  ean: z
    .string()
    .trim()
    .regex(/^\d{8}$|^\d{12,14}$/, "EAN non valido")
    .optional()
    .nullable()
    .or(z.literal("")),
  nome: z.string().trim().min(1).max(200),
  descrizione: z.string().trim().max(2000).optional().nullable().or(z.literal("")),
  unitaMisura: z.string().trim().min(1).max(20).optional().default("pz"),
  quantita: z.coerce.number().min(0).optional().default(0),
  sogliaMinima: z.coerce.number().min(0).optional().default(0),
  ubicazione: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  attivo: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const lowStock = searchParams.get("lowStock") === "true";
  const includeInactive = searchParams.get("includeInactive") === "true";
  const page = Math.max(parseInt(searchParams.get("page") ?? "1") || 1, 1);
  const limitParam = parseInt(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 30;
  const skip = (page - 1) * limit;

  if (lowStock) {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        codice: string;
        ean: string | null;
        nome: string;
        descrizione: string | null;
        unitaMisura: string;
        quantita: Prisma.Decimal;
        sogliaMinima: Prisma.Decimal;
        ubicazione: string | null;
        attivo: boolean;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT *
      FROM "Articolo"
      WHERE "sogliaMinima" > 0
        AND "quantita" <= "sogliaMinima"
        AND (${includeInactive} OR "attivo" = true)
        AND (
          ${search} = ''
          OR "codice" ILIKE '%' || ${search} || '%'
          OR COALESCE("ean", '') ILIKE '%' || ${search} || '%'
          OR "nome" ILIKE '%' || ${search} || '%'
          OR COALESCE("ubicazione", '') ILIKE '%' || ${search} || '%'
        )
      ORDER BY "nome" ASC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Articolo"
      WHERE "sogliaMinima" > 0
        AND "quantita" <= "sogliaMinima"
        AND (${includeInactive} OR "attivo" = true)
        AND (
          ${search} = ''
          OR "codice" ILIKE '%' || ${search} || '%'
          OR COALESCE("ean", '') ILIKE '%' || ${search} || '%'
          OR "nome" ILIKE '%' || ${search} || '%'
          OR COALESCE("ubicazione", '') ILIKE '%' || ${search} || '%'
        )
    `;
    const total = Number(countRows[0]?.count ?? 0);

    return NextResponse.json({
      articoli: rows.map(serializeArticolo),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.attivo = true;

  if (search) {
    where.OR = [
      { codice: { contains: search, mode: "insensitive" as const } },
      { ean: { contains: search, mode: "insensitive" as const } },
      { nome: { contains: search, mode: "insensitive" as const } },
      { ubicazione: { contains: search, mode: "insensitive" as const } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.articolo.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ nome: "asc" }],
    }),
    prisma.articolo.count({ where }),
  ]);

  return NextResponse.json({
    articoli: rows.map(serializeArticolo),
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageMagazzino(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const ean = data.ean?.trim() || null;

  try {
    const articolo = await prisma.$transaction(async (tx) => {
      const created = await tx.articolo.create({
        data: {
          codice: data.codice.trim(),
          ean,
          nome: data.nome.trim(),
          descrizione: data.descrizione?.trim() || null,
          unitaMisura: data.unitaMisura || "pz",
          quantita: data.quantita,
          sogliaMinima: data.sogliaMinima,
          ubicazione: data.ubicazione?.trim() || null,
          attivo: data.attivo ?? true,
        },
      });

      if (data.quantita > 0) {
        await tx.movimentoMagazzino.create({
          data: {
            articoloId: created.id,
            tipo: "RETTIFICA",
            quantita: data.quantita,
            note: "Giacenza iniziale",
            userId: session.user!.id,
          },
        });
      }

      return created;
    });

    return NextResponse.json(serializeArticolo(articolo), { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "Codice o EAN già presente in magazzino" },
        { status: 409 }
      );
    }
    throw err;
  }
}
