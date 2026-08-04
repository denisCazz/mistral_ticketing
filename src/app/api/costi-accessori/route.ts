import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CATEGORIE_COSTO_ACCESSORIO,
  type CategoriaCostoAccessorio,
} from "@/lib/costi-accessori";

function parseMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw
    ? null
    : date;
}

function parseImporto(value: unknown) {
  const importo = Number(value);
  if (!Number.isFinite(importo) || importo <= 0) return null;
  return Math.round(importo * 100) / 100;
}

function serializeCosto(costo: {
  id: string;
  dipendenteId: string;
  data: Date;
  categoria: string;
  importo: unknown;
  note: string | null;
  dipendente: { nome: string; cognome: string };
}) {
  return {
    ...costo,
    data: costo.data.toISOString().slice(0, 10),
    importo: Number(costo.importo),
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const range = parseMonth(searchParams.get("mese"));
  if (!range) {
    return NextResponse.json(
      { error: "Parametro mese obbligatorio (YYYY-MM)" },
      { status: 400 }
    );
  }

  const costi = await prisma.costoAccessorio.findMany({
    where: { data: { gte: range.from, lt: range.to } },
    include: {
      dipendente: { select: { nome: true, cognome: true } },
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    costi: costi.map(serializeCosto),
    totale: costi.reduce((sum, costo) => sum + Number(costo.importo), 0),
  });
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
  const dipendenteId = String(body.dipendenteId ?? "").trim();
  const data = parseDate(body.data);
  const categoria = String(body.categoria ?? "") as CategoriaCostoAccessorio;
  const importo = parseImporto(body.importo);
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : null;

  if (
    !dipendenteId ||
    !data ||
    !CATEGORIE_COSTO_ACCESSORIO.includes(categoria) ||
    importo === null
  ) {
    return NextResponse.json(
      { error: "Dipendente, data, categoria e importo valido sono obbligatori" },
      { status: 400 }
    );
  }

  const dipendente = await prisma.dipendente.findUnique({
    where: { id: dipendenteId },
    select: { id: true },
  });
  if (!dipendente) {
    return NextResponse.json({ error: "Dipendente non trovato" }, { status: 404 });
  }

  const costo = await prisma.costoAccessorio.create({
    data: { dipendenteId, data, categoria, importo, note },
    include: {
      dipendente: { select: { nome: true, cognome: true } },
    },
  });

  return NextResponse.json({ costo: serializeCosto(costo) }, { status: 201 });
}
