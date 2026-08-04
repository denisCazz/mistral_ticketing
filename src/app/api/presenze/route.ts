import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureUsersForDipendenti,
  getOrCreateCostiStandard,
  prefillSedeWeekdays,
} from "@/lib/dipendente-user";
import {
  resolveTariffe,
  TIPI_PRESENZA,
  type TariffeDipendente,
  type TipoPresenza,
} from "@/lib/presenze";

function parseYearMonth(value: string | null): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function monthRange(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from, to };
}

function serializeDipendente(d: {
  id: string;
  nome: string;
  cognome: string;
  active: boolean;
  archiviato: boolean;
  userId: string | null;
  costoGiornata: unknown | null;
  indennitaTrasferta: unknown | null;
  costoMutua: unknown | null;
  costoPermesso: unknown | null;
  costoFerie: unknown | null;
  costoFestivo: unknown | null;
  user?: { email: string } | null;
}, standard: TariffeDipendente) {
  return {
    id: d.id,
    nome: d.nome,
    cognome: d.cognome,
    active: d.active,
    archiviato: d.archiviato,
    userId: d.userId,
    email: d.user?.email ?? null,
    ...resolveTariffe(d, standard),
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
  const ym = parseYearMonth(searchParams.get("mese"));
  if (!ym) {
    return NextResponse.json(
      { error: "Parametro mese obbligatorio (YYYY-MM)" },
      { status: 400 }
    );
  }

  const { from, to } = monthRange(ym.year, ym.month);
  const standard = await getOrCreateCostiStandard();

  let dipendenti = await prisma.dipendente.findMany({
    where: { archiviato: false },
    orderBy: [{ cognome: "asc" }, { nome: "asc" }],
    include: { user: { select: { email: true } } },
  });

  const missingUsers = dipendenti.filter((d) => !d.userId);
  if (missingUsers.length > 0) {
    await ensureUsersForDipendenti(missingUsers);
    dipendenti = await prisma.dipendente.findMany({
      where: { archiviato: false },
      orderBy: [{ cognome: "asc" }, { nome: "asc" }],
      include: { user: { select: { email: true } } },
    });
  }

  await prefillSedeWeekdays({
    year: ym.year,
    month: ym.month,
    dipendenteIds: dipendenti.map((d) => d.id),
  });

  const presenze = await prisma.presenzaGiorno.findMany({
    where: {
      data: { gte: from, lte: to },
      dipendenteId: { in: dipendenti.map((d) => d.id) },
    },
    select: {
      id: true,
      dipendenteId: true,
      data: true,
      tipo: true,
      note: true,
    },
  });

  const costiAccessori = await prisma.costoAccessorio.groupBy({
    by: ["dipendenteId"],
    where: {
      data: { gte: from, lte: to },
      dipendenteId: { in: dipendenti.map((d) => d.id) },
    },
    _sum: { importo: true },
  });

  return NextResponse.json({
    mese: `${ym.year}-${String(ym.month).padStart(2, "0")}`,
    dipendenti: dipendenti.map((d) => serializeDipendente(d, standard)),
    presenze: presenze.map((p) => ({
      id: p.id,
      dipendenteId: p.dipendenteId,
      data: p.data.toISOString().slice(0, 10),
      tipo: p.tipo,
      note: p.note,
    })),
    costiAccessori: costiAccessori.map((costo) => ({
      dipendenteId: costo.dipendenteId,
      totale: Number(costo._sum.importo ?? 0),
    })),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const dipendenteId = String(body.dipendenteId ?? "").trim();
  const dataStr = String(body.data ?? "").trim();
  const tipoRaw = body.tipo;

  if (!dipendenteId || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return NextResponse.json(
      { error: "dipendenteId e data (YYYY-MM-DD) obbligatori" },
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

  const data = new Date(`${dataStr}T00:00:00.000Z`);

  if (tipoRaw === null || tipoRaw === "" || tipoRaw === undefined) {
    await prisma.presenzaGiorno.deleteMany({
      where: { dipendenteId, data },
    });
    return NextResponse.json({ presenza: null });
  }

  if (!TIPI_PRESENZA.includes(tipoRaw as TipoPresenza)) {
    return NextResponse.json({ error: "Tipo presenza non valido" }, { status: 400 });
  }

  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;

  const presenza = await prisma.presenzaGiorno.upsert({
    where: {
      dipendenteId_data: { dipendenteId, data },
    },
    create: {
      dipendenteId,
      data,
      tipo: tipoRaw as TipoPresenza,
      note,
    },
    update: {
      tipo: tipoRaw as TipoPresenza,
      note,
    },
  });

  return NextResponse.json({
    presenza: {
      id: presenza.id,
      dipendenteId: presenza.dipendenteId,
      data: presenza.data.toISOString().slice(0, 10),
      tipo: presenza.tipo,
      note: presenza.note,
    },
  });
}
