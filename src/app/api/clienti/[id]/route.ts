import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  ragioneSociale: z.string().min(1).optional(),
  cellulare: z.string().optional().nullable(),
  telFisso: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  citta: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  indirizzo: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  note1: z.string().optional().nullable(),
  note2: z.string().optional().nullable(),
  note3: z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      preventivi: {
        where: preventivoWhereForSession(session),
        orderBy: { createdAt: "desc" },
        include: {
          operatore: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!cliente) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(cliente);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(email !== undefined ? { email: email || null } : {}),
  };

  const cliente = await prisma.cliente.update({ where: { id }, data });
  return NextResponse.json(cliente);
}
