import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { upsertCliente } from "@/lib/import-cliente";
import { parseXlsx } from "@/lib/xlsx-parser";

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB
  if (typeof file.size === "number" && file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { error: "File troppo grande (max 10 MB)" },
      { status: 413 }
    );
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json(
      { error: "Formato non supportato: usa un file .xlsx" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseXlsx(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "File XLSX non valido";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { ok, ko, duplicati, headers, stats } = parsed;

  let created = 0;
  let updated = 0;
  const errori: string[] = [];

  for (const row of ok) {
    try {
      const { action } = await upsertCliente(row);
      if (action === "created") created++;
      else updated++;
    } catch (err) {
      errori.push(
        `${row.ragioneSociale}: ${err instanceof Error ? err.message : "errore sconosciuto"}`
      );
    }
  }

  await prisma.xlsxDuplicato.deleteMany({ where: { risolto: false } });

  let duplicatiRecords = 0;
  for (const gruppo of duplicati) {
    for (const record of gruppo.records) {
      await prisma.xlsxDuplicato.create({
        data: {
          gruppoId: gruppo.gruppoId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recordJson: record as any,
        },
      });
      duplicatiRecords++;
    }
  }

  return NextResponse.json({
    created,
    updated,
    ok: created + updated,
    ko: ko.length,
    errori: errori.length,
    duplicati: duplicati.length,
    duplicatiRecords,
    motiviKo: ko.slice(0, 10).map((k) => k.motivo),
    erroriDettaglio: errori.slice(0, 10),
    headers,
    stats,
    fileName: file.name,
  });
}
