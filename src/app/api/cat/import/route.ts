import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCatXlsx, upsertCat } from "@/lib/cat-import";

// ABBOZZO — import CAT da XLSX. Upsert per email/sourceId.
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

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseCatXlsx(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "File XLSX non valido";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { ok, ko, headers } = parsed;
  let created = 0;
  let updated = 0;
  const errori: string[] = [];

  for (const row of ok) {
    try {
      const action = await upsertCat(row);
      if (action === "created") created++;
      else updated++;
    } catch (err) {
      errori.push(`${row.ragioneSociale}: ${err instanceof Error ? err.message : "errore"}`);
    }
  }

  return NextResponse.json({
    created,
    updated,
    ok: created + updated,
    ko: ko.length,
    motiviKo: ko.slice(0, 10).map((k) => k.motivo),
    errori: errori.length,
    erroriDettaglio: errori.slice(0, 10),
    headers,
    fileName: file.name,
  });
}
