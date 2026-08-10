import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listClienti } from "@/lib/clienti-queries";
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
  const result = await listClienti({
    search: searchParams.get("search") ?? "",
    page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
    limit: parseInt(searchParams.get("limit") ?? "20", 10) || 20,
  });

  return NextResponse.json(result);
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
