import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  ragioneSociale: z.string().min(1).optional(),
  emails: z.array(z.string().email()).min(1).optional(),
  referenti: z.array(z.string().min(1)).optional(),
  telefono: z.string().optional().nullable(),
  indirizzo: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cat = await prisma.cat.update({ where: { id }, data: parsed.data });
  return NextResponse.json(cat);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Elimina davvero il CAT. Le pratiche e gli utenti collegati mantengono i
  // dati ma perdono il riferimento al CAT (catId nullable).
  await prisma.$transaction([
    prisma.pratica.updateMany({ where: { catId: id }, data: { catId: null } }),
    prisma.user.updateMany({ where: { catId: id }, data: { catId: null } }),
    prisma.cat.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
