import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TIPI_PRESENZA, type TipoPresenza } from "@/lib/presenze";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UPDATES = 2000;

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const dipendenteIds: string[] = [
    ...new Set<string>(
      Array.isArray(body.dipendenteIds)
        ? body.dipendenteIds.map((value: unknown) => String(value)).filter(Boolean)
        : []
    ),
  ];
  const dateStrings: string[] = [
    ...new Set<string>(
      Array.isArray(body.date)
        ? body.date
            .map((value: unknown) => String(value))
            .filter((value: string) => DATE_PATTERN.test(value))
        : []
    ),
  ];
  const tipo = body.tipo as TipoPresenza;

  if (
    dipendenteIds.length === 0 ||
    dateStrings.length === 0 ||
    !TIPI_PRESENZA.includes(tipo)
  ) {
    return NextResponse.json(
      { error: "Seleziona dipendenti, date e uno stato valido" },
      { status: 400 }
    );
  }

  const numeroAggiornamenti = dipendenteIds.length * dateStrings.length;
  if (numeroAggiornamenti > MAX_UPDATES) {
    return NextResponse.json(
      { error: `Massimo ${MAX_UPDATES} aggiornamenti per operazione` },
      { status: 400 }
    );
  }

  const dipendentiEsistenti = await prisma.dipendente.count({
    where: { id: { in: dipendenteIds }, archiviato: false },
  });
  if (dipendentiEsistenti !== dipendenteIds.length) {
    return NextResponse.json(
      { error: "Uno o più dipendenti non sono validi" },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    dipendenteIds.flatMap((dipendenteId) =>
      dateStrings.map((dataString) => {
        const data = new Date(`${dataString}T00:00:00.000Z`);
        return prisma.presenzaGiorno.upsert({
          where: { dipendenteId_data: { dipendenteId, data } },
          create: { dipendenteId, data, tipo },
          update: { tipo },
        });
      })
    )
  );

  return NextResponse.json({ aggiornati: numeroAggiornamenti });
}
