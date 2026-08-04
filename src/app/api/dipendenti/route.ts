import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  DIPENDENTE_DEFAULT_PASSWORD,
  ensureCategorieDipendente,
  ensureUserForDipendente,
  ensureUsersForDipendenti,
  getTariffeCategoria,
  prefillSedeWeekdays,
} from "@/lib/dipendente-user";
import {
  resolveTariffe,
  type TariffeDipendente,
} from "@/lib/presenze";

function serializeDipendente(
  d: {
    id: string;
    nome: string;
    cognome: string;
    active: boolean;
    archiviato: boolean;
    userId: string | null;
    categoriaId: string;
    categoria: { id: string; nome: string };
    costoGiornata: unknown | null;
    indennitaTrasferta: unknown | null;
    costoMutua: unknown | null;
    costoPermesso: unknown | null;
    costoFerie: unknown | null;
    costoFestivo: unknown | null;
  },
  standard: TariffeDipendente,
  userEmail?: string | null
) {
  return {
    id: d.id,
    nome: d.nome,
    cognome: d.cognome,
    active: d.active,
    archiviato: d.archiviato,
    userId: d.userId,
    email: userEmail ?? null,
    categoriaId: d.categoriaId,
    categoria: d.categoria,
    tariffePersonalizzate: {
      costoGiornata: d.costoGiornata == null ? null : Number(d.costoGiornata),
      indennitaTrasferta:
        d.indennitaTrasferta == null ? null : Number(d.indennitaTrasferta),
      costoMutua: d.costoMutua == null ? null : Number(d.costoMutua),
      costoPermesso: d.costoPermesso == null ? null : Number(d.costoPermesso),
      costoFerie: d.costoFerie == null ? null : Number(d.costoFerie),
      costoFestivo: d.costoFestivo == null ? null : Number(d.costoFestivo),
    },
    ...resolveTariffe(d, standard),
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessDocumentiHr(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const includeArchiviati = searchParams.get("archiviati") === "1";
  const ensureUsers = searchParams.get("ensureUsers") === "1";
  await ensureCategorieDipendente();

  let rows = await prisma.dipendente.findMany({
    where: includeArchiviati ? undefined : { archiviato: false },
    orderBy: [{ cognome: "asc" }, { nome: "asc" }],
    include: {
      user: { select: { email: true } },
      categoria: { select: { id: true, nome: true } },
    },
  });

  if (ensureUsers) {
    await ensureUsersForDipendenti(rows);
    rows = await prisma.dipendente.findMany({
      where: includeArchiviati ? undefined : { archiviato: false },
      orderBy: [{ cognome: "asc" }, { nome: "asc" }],
      include: {
        user: { select: { email: true } },
        categoria: { select: { id: true, nome: true } },
      },
    });
  }

  const standardEntries = await Promise.all(
    [...new Set(rows.map((d) => d.categoriaId))].map(async (categoriaId) => [
      categoriaId,
      await getTariffeCategoria(categoriaId),
    ] as const)
  );
  const standardMap = new Map(standardEntries);
  const dipendenti = rows.map((d) => {
    const standard = standardMap.get(d.categoriaId);
    if (!standard) throw new Error(`Tariffe mancanti per ${d.categoriaId}`);
    return serializeDipendente(d, standard, d.user?.email);
  });

  return NextResponse.json({ dipendenti });
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
  const nome = String(body.nome ?? "").trim();
  const cognome = String(body.cognome ?? "").trim();
  const categoriaId = String(body.categoriaId ?? "manutentore").trim();
  if (!nome || !cognome) {
    return NextResponse.json(
      { error: "Nome e cognome obbligatori" },
      { status: 400 }
    );
  }
  await ensureCategorieDipendente();
  const categoria = await prisma.categoriaDipendente.findUnique({
    where: { id: categoriaId },
  });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
  }

  const existing = await prisma.dipendente.findFirst({
    where: {
      nome: { equals: nome, mode: "insensitive" },
      cognome: { equals: cognome, mode: "insensitive" },
    },
    include: {
      user: { select: { email: true } },
      categoria: { select: { id: true, nome: true } },
    },
  });
  if (existing) {
    const standard = await getTariffeCategoria(existing.categoriaId);
    if (!existing.userId) {
      await ensureUserForDipendente(existing);
      const refreshed = await prisma.dipendente.findUnique({
        where: { id: existing.id },
        include: {
          user: { select: { email: true } },
          categoria: { select: { id: true, nome: true } },
        },
      });
      if (refreshed) {
        return NextResponse.json({
          dipendente: serializeDipendente(
            refreshed,
            standard,
            refreshed.user?.email
          ),
        });
      }
    }
    return NextResponse.json({
      dipendente: serializeDipendente(existing, standard, existing.user?.email),
    });
  }

  const now = new Date();

  const dipendente = await prisma.dipendente.create({
    data: {
      nome,
      cognome,
      categoriaId,
    },
  });

  const { email } = await ensureUserForDipendente({
    id: dipendente.id,
    nome: dipendente.nome,
    cognome: dipendente.cognome,
    userId: null,
  });

  await prefillSedeWeekdays({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    dipendenteIds: [dipendente.id],
  });

  const full = await prisma.dipendente.findUniqueOrThrow({
    where: { id: dipendente.id },
    include: {
      user: { select: { email: true } },
      categoria: { select: { id: true, nome: true } },
    },
  });
  const standard = await getTariffeCategoria(full.categoriaId);

  return NextResponse.json(
    {
      dipendente: serializeDipendente(
        full,
        standard,
        full.user?.email ?? email
      ),
      credenziali: {
        utente: email.split("@")[0],
        email,
        password: DIPENDENTE_DEFAULT_PASSWORD,
      },
    },
    { status: 201 }
  );
}
