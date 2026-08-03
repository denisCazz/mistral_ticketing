import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marche = await prisma.marca.findMany({
    orderBy: { nome: "asc" },
    include: { modelli: { orderBy: { nome: "asc" }, select: { id: true, nome: true, marcaId: true } } },
  });

  return NextResponse.json(marche);
}
