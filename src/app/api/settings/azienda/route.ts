import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";

function publicAzienda(settings: {
  id: string;
  nomeAzienda: string;
  logo: string | null;
  indirizzo: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  pec: string | null;
  codiceDestinatarioSdi: string | null;
  telefono: string | null;
  email: string | null;
}) {
  return {
    id: settings.id,
    nomeAzienda: settings.nomeAzienda,
    logo: settings.logo,
    indirizzo: settings.indirizzo,
    partitaIva: settings.partitaIva,
    codiceFiscale: settings.codiceFiscale,
    pec: settings.pec,
    codiceDestinatarioSdi: settings.codiceDestinatarioSdi,
    telefono: settings.telefono,
    email: settings.email,
  };
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let settings = await prisma.aziendaSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    settings = await prisma.aziendaSettings.create({
      data: { id: "default", nomeAzienda: "Mistral Impianti" },
    });
  }

  if (isAdmin(session)) {
    return NextResponse.json(settings);
  }
  return NextResponse.json(publicAzienda(settings));
}
