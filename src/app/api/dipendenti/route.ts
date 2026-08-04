import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  DIPENDENTE_DEFAULT_PASSWORD,
  ensureUserForDipendente,
  ensureUsersForDipendenti,
  getOrCreateCostiStandard,
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
  const standard = await getOrCreateCostiStandard();

  let rows = await prisma.dipendente.findMany({
    where: includeArchiviati ? undefined : { archiviato: false },
    orderBy: [{ cognome: "asc" }, { nome: "asc" }],
    include: { user: { select: { email: true } } },
  });

  if (ensureUsers) {
    await ensureUsersForDipendenti(rows);
    rows = await prisma.dipendente.findMany({
      where: includeArchiviati ? undefined : { archiviato: false },
      orderBy: [{ cognome: "asc" }, { nome: "asc" }],
      include: { user: { select: { email: true } } },
    });
  }

  const dipendenti = rows.map((d) =>
    serializeDipendente(d, standard, d.user?.email)
  );

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
  if (!nome || !cognome) {
    return NextResponse.json(
      { error: "Nome e cognome obbligatori" },
      { status: 400 }
    );
  }

  const existing = await prisma.dipendente.findFirst({
    where: {
      nome: { equals: nome, mode: "insensitive" },
      cognome: { equals: cognome, mode: "insensitive" },
    },
    include: { user: { select: { email: true } } },
  });
  if (existing) {
    const standard = await getOrCreateCostiStandard();
    if (!existing.userId) {
      await ensureUserForDipendente(existing);
      const refreshed = await prisma.dipendente.findUnique({
        where: { id: existing.id },
        include: { user: { select: { email: true } } },
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
    include: { user: { select: { email: true } } },
  });
  const standard = await getOrCreateCostiStandard();

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
