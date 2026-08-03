import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "OPERATORE", "MANUTENTORE"]).optional(),
  active: z.boolean().optional(),
  catId: z.string().min(1).optional().nullable(),
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

  const { name, password, role, active, catId } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (active !== undefined) updateData.active = active;
  if (catId !== undefined) updateData.catId = catId || null;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      catId: true,
      cat: { select: { id: true, ragioneSociale: true } },
    },
  });

  return NextResponse.json(user);
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

  if (session.user?.id === id) {
    return NextResponse.json(
      { error: "Non puoi eliminare il tuo stesso account" },
      { status: 400 }
    );
  }

  // Un utente non può essere eliminato se è operatore di pratiche o ha
  // registrato cambi di stato (riferimenti obbligatori): in tal caso viene
  // disattivato per preservare lo storico.
  const [comeOperatore, comeStoria] = await Promise.all([
    prisma.pratica.count({ where: { operatoreId: id } }),
    prisma.praticaStoria.count({ where: { changedById: id } }),
  ]);

  if (comeOperatore > 0 || comeStoria > 0) {
    const user = await prisma.user.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ user, softDeleted: true });
  }

  // Rimuove i riferimenti opzionali (manutentore) e poi elimina l'utente.
  await prisma.$transaction([
    prisma.pratica.updateMany({
      where: { manutentoreId: id },
      data: { manutentoreId: null },
    }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
