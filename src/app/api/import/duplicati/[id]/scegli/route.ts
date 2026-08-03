import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { upsertCliente } from "@/lib/import-cliente";
import type { ClienteRow } from "@/lib/xlsx-parser";

// POST /api/import/duplicati/[id]/scegli — scegli questo record come quello da mantenere
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const duplicato = await prisma.xlsxDuplicato.findUnique({ where: { id } });
  if (!duplicato) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const record = duplicato.recordJson as unknown as ClienteRow;
  const { cliente, action } = await upsertCliente(record);

  // Mark all duplicates in the group as resolved
  await prisma.xlsxDuplicato.updateMany({
    where: { gruppoId: duplicato.gruppoId },
    data: { risolto: true, scelto: false },
  });

  // Mark this one as chosen
  await prisma.xlsxDuplicato.update({
    where: { id },
    data: { scelto: true },
  });

  return NextResponse.json({ cliente, action });
}
