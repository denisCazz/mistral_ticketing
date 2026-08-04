import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrCreateCostiStandard } from "@/lib/dipendente-user";
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

  const costoGiornata = parseMoney(body.costoGiornata);
  const indennitaTrasferta = parseMoney(body.indennitaTrasferta);
  const costoMutua = parseMoney(body.costoMutua);
  const costoPermesso = parseMoney(body.costoPermesso);
  const costoFerie = parseMoney(body.costoFerie);
  const costoFestivo = parseMoney(body.costoFestivo);

  if (costoGiornata !== undefined) data.costoGiornata = costoGiornata;
  if (indennitaTrasferta !== undefined) data.indennitaTrasferta = indennitaTrasferta;
  if (costoMutua !== undefined) data.costoMutua = costoMutua;
  if (costoPermesso !== undefined) data.costoPermesso = costoPermesso;
  if (costoFerie !== undefined) data.costoFerie = costoFerie;
  if (costoFestivo !== undefined) data.costoFestivo = costoFestivo;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const dipendente = await prisma.dipendente.update({
    where: { id },
    data,
  });
  const standard = await getOrCreateCostiStandard();

  return NextResponse.json({
    dipendente: {
      ...dipendente,
      ...resolveTariffe(dipendente, standard),
    },
  });
}
