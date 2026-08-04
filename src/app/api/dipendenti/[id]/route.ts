import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureCategorieDipendente,
  getTariffeCategoria,
} from "@/lib/dipendente-user";
import { resolveTariffe } from "@/lib/presenze";

function parseMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

export async function PATCH(
  req: Request,
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
  const body = await req.json();

  const existing = await prisma.dipendente.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Dipendente non trovato" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.nome === "string" && body.nome.trim()) {
    data.nome = body.nome.trim();
  }
  if (typeof body.cognome === "string" && body.cognome.trim()) {
    data.cognome = body.cognome.trim();
  }
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.archiviato === "boolean") data.archiviato = body.archiviato;

  if (typeof body.categoriaId === "string") {
    await ensureCategorieDipendente();
    const categoriaId = body.categoriaId.trim();
    const categoria = await prisma.categoriaDipendente.findUnique({
      where: { id: categoriaId },
      select: { id: true },
    });
    if (!categoria) {
      return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
    }
    data.categoriaId = categoriaId;
  }

  for (const key of [
    "costoGiornata",
    "indennitaTrasferta",
    "costoMutua",
    "costoPermesso",
    "costoFerie",
    "costoFestivo",
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (body[key] === null || body[key] === "") {
      data[key] = null;
      continue;
    }
    const parsed = parseMoney(body[key]);
    if (parsed === undefined) {
      return NextResponse.json(
        { error: `Valore non valido per ${key}` },
        { status: 400 }
      );
    }
    data[key] = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const dipendente = await prisma.dipendente.update({
    where: { id },
    data,
    include: { categoria: { select: { id: true, nome: true } } },
  });
  const standard = await getTariffeCategoria(dipendente.categoriaId);

  return NextResponse.json({
    dipendente: {
      ...dipendente,
      tariffePersonalizzate: {
        costoGiornata:
          dipendente.costoGiornata == null ? null : Number(dipendente.costoGiornata),
        indennitaTrasferta:
          dipendente.indennitaTrasferta == null
            ? null
            : Number(dipendente.indennitaTrasferta),
        costoMutua:
          dipendente.costoMutua == null ? null : Number(dipendente.costoMutua),
        costoPermesso:
          dipendente.costoPermesso == null ? null : Number(dipendente.costoPermesso),
        costoFerie:
          dipendente.costoFerie == null ? null : Number(dipendente.costoFerie),
        costoFestivo:
          dipendente.costoFestivo == null ? null : Number(dipendente.costoFestivo),
      },
      ...resolveTariffe(dipendente, standard),
    },
  });
}
