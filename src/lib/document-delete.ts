import { prisma } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2";

export const MAX_DOCUMENTI_DELETE = 100;

export async function deleteDocumentoRecords(
  documenti: Array<{ id: string; storageKey: string }>
): Promise<number> {
  if (documenti.length === 0) return 0;

  const ids = documenti.map((doc) => doc.id);
  await prisma.scadenza.deleteMany({ where: { documentoId: { in: ids } } });
  const deleted = await prisma.documento.deleteMany({ where: { id: { in: ids } } });

  await Promise.all(
    documenti.map((doc) =>
      deleteFromR2(doc.storageKey).catch((err) => {
        console.warn(`R2 delete failed ${doc.storageKey}:`, err);
      })
    )
  );

  return deleted.count;
}
