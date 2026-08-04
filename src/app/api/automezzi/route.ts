import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const includeSuperati = searchParams.get("superati") === "1";

  const automezzi = await prisma.automezzo.findMany({
    where: includeSuperati ? undefined : { superato: false },
    orderBy: { targa: "asc" },
    select: {
      id: true,
      targa: true,
      descrizione: true,
      superato: true,
    },
  });

  return NextResponse.json({ automezzi });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const targa = String(body.targa ?? "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  if (!targa) {
    return NextResponse.json({ error: "Targa obbligatoria" }, { status: 400 });
  }

  const existing = await prisma.automezzo.findUnique({ where: { targa } });
  if (existing) {
    return NextResponse.json({ automezzo: existing });
  }

  const automezzo = await prisma.automezzo.create({
    data: {
      targa,
      descrizione: body.descrizione ? String(body.descrizione) : null,
    },
  });

  return NextResponse.json({ automezzo }, { status: 201 });
}
