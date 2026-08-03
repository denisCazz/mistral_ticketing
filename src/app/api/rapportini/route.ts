import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SETTORE_VALUES, TIPO_IMPIANTO_BY_SETTORE } from "@/lib/rapportino-constants";
import { toDateOnlyString } from "@/types/rapportino";
import { z } from "zod";

const allTipiImpianto = [
  ...TIPO_IMPIANTO_BY_SETTORE.antincendio,
  ...TIPO_IMPIANTO_BY_SETTORE.elettrico,
] as [string, ...string[]];

const createSchema = z.object({
  clienteId: z.string().min(1),
  praticaId: z.string().optional().nullable(),
  dataRichiesta: z.string().optional().nullable(),
  dataIntervento: z.string().min(1),
  oraIntervento: z.string().optional().nullable(),
  tipologiaIntervento: z.string().optional().nullable(),
  settore: z.enum(SETTORE_VALUES),
  tipoImpianto: z.enum(allTipiImpianto),
  marca: z.string().min(1),
  modello: z.string().min(1),
  numeroSerie: z.string().optional().nullable(),
  dataAcquisto: z.string().optional().nullable(),
  rivenditore: z.string().optional().nullable(),
  tipoIntervento: z.string().min(1),
  motivoChiamata: z.string().optional().nullable(),
  codiceErrore: z.string().optional().nullable(),
  verifiche: z.string().optional().nullable(),
  installazioneEseguitaDa: z.string().optional().nullable(),
  descrizione: z.string().min(1),
  spiegataManutenzione: z.string().optional().nullable(),
  accessibilita: z.string().optional().nullable(),
  integritaComponente: z.string().optional().nullable(),
  conformitaNormativa: z.string().optional().nullable(),
  esitoFunzionamento: z.string().optional().nullable(),
  presaVisioneCondizioniGaranzia: z.boolean().optional().nullable(),
  ubicazione: z.string().optional().nullable(),
  noteUbicazione: z.string().optional().nullable(),
  prossimoIntervento: z.string().optional().nullable(),
  materialiUtilizzati: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  firmaClientePrivacy: z.string().optional().nullable(),
  firmaOperatore: z.string().optional().nullable(),
  firmaCliente: z.string().optional().nullable(),
});

function mapRapportino(r: {
  id: string;
  utenteId: string;
  clienteId: string;
  praticaId: string | null;
  dataRichiesta: Date | null;
  dataIntervento: Date;
  oraIntervento: string | null;
  tipologiaIntervento: string | null;
  settore: string;
  tipoImpianto: string;
  marca: string;
  modello: string;
  numeroSerie: string | null;
  dataAcquisto: Date | null;
  rivenditore: string | null;
  tipoIntervento: string;
  motivoChiamata: string | null;
  codiceErrore: string | null;
  verifiche: string | null;
  installazioneEseguitaDa: string | null;
  descrizione: string;
  spiegataManutenzione: string | null;
  accessibilita: string | null;
  integritaComponente: string | null;
  conformitaNormativa: string | null;
  esitoFunzionamento: string | null;
  presaVisioneCondizioniGaranzia: boolean | null;
  ubicazione: string | null;
  noteUbicazione: string | null;
  prossimoIntervento: Date | null;
  materialiUtilizzati: string | null;
  note: string | null;
  firmaClientePrivacy: string | null;
  firmaOperatore: string | null;
  firmaCliente: string | null;
  createdAt: Date;
  updatedAt: Date;
  cliente?: unknown;
  utente?: unknown;
  pratica?: unknown;
}) {
  return {
    ...r,
    dataRichiesta: toDateOnlyString(r.dataRichiesta),
    dataIntervento: toDateOnlyString(r.dataIntervento)!,
    dataAcquisto: toDateOnlyString(r.dataAcquisto),
    prossimoIntervento: toDateOnlyString(r.prossimoIntervento),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim();
  const settore = searchParams.get("settore") || undefined;
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));

  const where: Record<string, unknown> = {};
  if (session.user.role !== "ADMIN") {
    where.utenteId = session.user.id;
  }
  if (settore === "antincendio" || settore === "elettrico") {
    where.settore = settore;
  }
  if (search) {
    where.OR = [
      { marca: { contains: search, mode: "insensitive" } },
      { modello: { contains: search, mode: "insensitive" } },
      { tipoImpianto: { contains: search, mode: "insensitive" } },
      { descrizione: { contains: search, mode: "insensitive" } },
      { cliente: { ragioneSociale: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.rapportino.count({ where }),
    prisma.rapportino.findMany({
      where,
      orderBy: { dataIntervento: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        cliente: {
          select: {
            id: true,
            ragioneSociale: true,
            nome: true,
            cognome: true,
            indirizzo: true,
            citta: true,
            cap: true,
            cellulare: true,
            telFisso: true,
            email: true,
          },
        },
        utente: { select: { id: true, name: true, email: true, qualifica: true } },
        pratica: { select: { id: true, numeroPratica: true } },
      },
    }),
  ]);

  return NextResponse.json({
    data: rows.map(mapRapportino),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const allowed = TIPO_IMPIANTO_BY_SETTORE[data.settore] as readonly string[];
  if (!allowed.includes(data.tipoImpianto)) {
    return NextResponse.json(
      { error: "Tipo impianto non valido per il settore selezionato" },
      { status: 400 }
    );
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } });
  if (!cliente) {
    return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }

  if (data.praticaId) {
    const pratica = await prisma.pratica.findUnique({ where: { id: data.praticaId } });
    if (!pratica) {
      return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
    }
  }

  const created = await prisma.rapportino.create({
    data: {
      utenteId: session.user.id,
      clienteId: data.clienteId,
      praticaId: data.praticaId || null,
      dataRichiesta: parseOptionalDate(data.dataRichiesta),
      dataIntervento: new Date(data.dataIntervento),
      oraIntervento: data.oraIntervento || null,
      tipologiaIntervento: data.tipologiaIntervento || null,
      settore: data.settore,
      tipoImpianto: data.tipoImpianto,
      marca: data.marca,
      modello: data.modello,
      numeroSerie: data.numeroSerie || null,
      dataAcquisto: parseOptionalDate(data.dataAcquisto),
      rivenditore: data.rivenditore || null,
      tipoIntervento: data.tipoIntervento,
      motivoChiamata: data.motivoChiamata || null,
      codiceErrore: data.codiceErrore || null,
      verifiche: data.verifiche || null,
      installazioneEseguitaDa: data.installazioneEseguitaDa || null,
      descrizione: data.descrizione,
      spiegataManutenzione: data.spiegataManutenzione || null,
      accessibilita: data.accessibilita || null,
      integritaComponente: data.integritaComponente || null,
      conformitaNormativa: data.conformitaNormativa || null,
      esitoFunzionamento: data.esitoFunzionamento || null,
      presaVisioneCondizioniGaranzia: data.presaVisioneCondizioniGaranzia ?? false,
      ubicazione: data.ubicazione || null,
      noteUbicazione: data.noteUbicazione || null,
      prossimoIntervento: parseOptionalDate(data.prossimoIntervento),
      materialiUtilizzati: data.materialiUtilizzati || null,
      note: data.note || null,
      firmaClientePrivacy: data.firmaClientePrivacy || null,
      firmaOperatore: data.firmaOperatore || null,
      firmaCliente: data.firmaCliente || null,
    },
    include: {
      cliente: true,
      utente: { select: { id: true, name: true, email: true, qualifica: true } },
      pratica: { select: { id: true, numeroPratica: true } },
    },
  });

  return NextResponse.json(mapRapportino(created), { status: 201 });
}
