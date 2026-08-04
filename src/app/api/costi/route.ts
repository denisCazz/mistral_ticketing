import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeTariffe } from "@/lib/dipendente-user";

function parseMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

async function getSettings() {
  let settings = await prisma.aziendaSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    settings = await prisma.aziendaSettings.create({
      data: { id: "default", nomeAzienda: "Mistral Impianti" },
    });
  }
  return settings;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getSettings();
  return NextResponse.json({ costi: serializeTariffe(settings) });
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
  const data: Record<string, number> = {};

  for (const key of [
    "costoGiornata",
    "indennitaTrasferta",
    "costoMutua",
    "costoPermesso",
    "costoFerie",
    "costoFestivo",
  ] as const) {
    const parsed = parseMoney(body[key]);
    if (parsed === undefined) {
      return NextResponse.json(
        { error: `Valore non valido per ${key}` },
        { status: 400 }
      );
    }
    data[key] = parsed;
  }

  await getSettings();
  const settings = await prisma.aziendaSettings.update({
    where: { id: "default" },
    data,
  });

  return NextResponse.json({ costi: serializeTariffe(settings) });
}
