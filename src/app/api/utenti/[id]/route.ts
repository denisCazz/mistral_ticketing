import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/password-policy";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  password: passwordSchema.optional(),
  role: z.enum(["ADMIN", "OPERATORE"]).optional(),
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

  const { name, password, role, active } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (active !== undefined) updateData.active = active;
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
    updateData.mustChangePassword = true;
  }

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

  const [comeOperatore, comeStoria] = await Promise.all([
    prisma.preventivo.count({ where: { operatoreId: id } }),
    prisma.preventivoStoria.count({ where: { changedById: id } }),
  ]);

  if (comeOperatore > 0 || comeStoria > 0) {
    const user = await prisma.user.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ user, softDeleted: true });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
