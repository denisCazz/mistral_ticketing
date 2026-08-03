import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const duplicati = await prisma.xlsxDuplicato.findMany({
    where: { risolto: false },
    orderBy: [{ gruppoId: "asc" }, { createdAt: "asc" }],
  });

  // Group by gruppoId
  const grouped = new Map<string, typeof duplicati>();
  for (const d of duplicati) {
    if (!grouped.has(d.gruppoId)) grouped.set(d.gruppoId, []);
    grouped.get(d.gruppoId)!.push(d);
  }

  return NextResponse.json(
    Array.from(grouped.entries()).map(([gruppoId, records]) => ({
      gruppoId,
      records,
    }))
  );
}
