import "dotenv/config";

import { prisma } from "../src/lib/db";
import { parseScadenzaFromText } from "../src/lib/scadenza-parser";

const dryRun = process.argv.includes("--dry-run");
/** Solo match espliciti scad./fino al (confidence >= 0.8) */
const minConfidence = 0.8;

async function main() {
  const docs = await prisma.documento.findMany({
    where: {
      dataScadenza: null,
      nonServeScadenza: false,
    },
    select: {
      id: true,
      titoloOriginale: true,
      categoria: true,
      sottocategoria: true,
      dipendenteId: true,
      automezzoId: true,
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const doc of docs) {
    const folderHint = [doc.categoria, doc.sottocategoria].filter(Boolean).join("/");
    const parsed = parseScadenzaFromText(doc.titoloOriginale, folderHint);

    if (!parsed.dataScadenza || parsed.confidence < minConfidence) {
      skipped++;
      continue;
    }

    const dateIso = parsed.dataScadenza.toISOString().slice(0, 10);
    console.log(
      `${dryRun ? "[dry] " : ""}${dateIso}  conf=${parsed.confidence}  ${parsed.rawValue}  |  ${doc.titoloOriginale}`,
    );

    if (!dryRun) {
      await prisma.documento.update({
        where: { id: doc.id },
        data: {
          dataScadenza: parsed.dataScadenza,
          scadenzaSource: parsed.fonte,
          scadenzaConfidence: parsed.confidence,
          scadenzaRaw: parsed.rawValue,
          statoValidita: parsed.statoValidita,
          nonServeScadenza: false,
        },
      });

      const existing = await prisma.scadenza.findFirst({
        where: { documentoId: doc.id },
      });
      if (existing) {
        await prisma.scadenza.update({
          where: { id: existing.id },
          data: {
            dataScadenza: parsed.dataScadenza,
            fonte: parsed.fonte,
            confidence: parsed.confidence,
            rawValue: parsed.rawValue,
            confermata: parsed.confidence >= 0.8,
          },
        });
      } else {
        await prisma.scadenza.create({
          data: {
            documentoId: doc.id,
            dipendenteId: doc.dipendenteId,
            automezzoId: doc.automezzoId,
            titolo: doc.titoloOriginale,
            dataScadenza: parsed.dataScadenza,
            fonte: parsed.fonte,
            confidence: parsed.confidence,
            rawValue: parsed.rawValue,
            confermata: parsed.confidence >= 0.8,
          },
        });
      }
    }

    applied++;
  }

  console.log(
    `\n${dryRun ? "Would apply" : "Applied"}: ${applied}  skipped: ${skipped}  total without date: ${docs.length}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
