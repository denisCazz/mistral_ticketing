import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await prisma.costoAccessorio.deleteMany({ where: { id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Costo non trovato" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
