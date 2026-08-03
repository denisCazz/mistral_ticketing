import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  ragioneSociale: z.string().min(1),
  emails: z.array(z.string().email()).min(1),
  referenti: z.array(z.string().min(1)).optional(),
  telefono: z.string().optional().nullable(),
  indirizzo: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const list = searchParams.get("list") === "1";

  if (list) {
    const cat = await prisma.cat.findMany({
      where: { active: true },
      select: { id: true, ragioneSociale: true },
      orderBy: { ragioneSociale: "asc" },
    });
    return NextResponse.json(cat);
  }

  const cat = await prisma.cat.findMany({
    where: search
      ? {
          OR: [
            { ragioneSociale: { contains: search, mode: "insensitive" } },
            { emails: { has: search } },
            { citta: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { ragioneSociale: "asc" },
    include: { _count: { select: { pratiche: true } } },
  });

  return NextResponse.json(cat);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cat = await prisma.cat.create({
    data: {
      ...parsed.data,
      referenti: parsed.data.referenti ?? [],
    },
  });
  return NextResponse.json(cat, { status: 201 });
}
