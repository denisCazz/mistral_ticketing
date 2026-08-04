import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  ragioneSociale: z.string().min(1),
  cellulare: z.string().optional().nullable(),
  telFisso: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  citta: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  indirizzo: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limitParam = parseInt(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 20;
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { ragioneSociale: { contains: search, mode: "insensitive" as const } },
          { cellulare: { contains: search, mode: "insensitive" as const } },
          { telFisso: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { citta: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [clienti, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      skip,
      take: limit,
      orderBy: { ragioneSociale: "asc" },
      include: { _count: { select: { preventivi: true } } },
    }),
    prisma.cliente.count({ where }),
  ]);

  return NextResponse.json({ clienti, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;
  const cliente = await prisma.cliente.create({
    data: {
      ...rest,
      email: email || null,
    },
  });

  return NextResponse.json(cliente, { status: 201 });
}
