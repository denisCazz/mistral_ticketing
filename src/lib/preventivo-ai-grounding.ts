import { prisma } from "@/lib/db";

function money(value: { toString(): string } | number | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

export async function loadPreventivoGrounding(
  clienteId: string | null
): Promise<string> {
  const [categorie, storico] = await Promise.all([
    prisma.categoriaDipendente.findMany({
      select: {
        nome: true,
        costoGiornata: true,
        indennitaTrasferta: true,
      },
      orderBy: { nome: "asc" },
    }),
    clienteId
      ? prisma.preventivo.findMany({
          where: { clienteId },
          orderBy: { updatedAt: "desc" },
          take: 3,
          select: {
            numeroPreventivo: true,
            stato: true,
            righe: {
              orderBy: { ordine: "asc" },
              take: 12,
              select: {
                descrizione: true,
                quantita: true,
                prezzoUnitario: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const lines: string[] = [];
  if (categorie.length) {
    lines.push("Tariffe manodopera (€/giornata, non inventare altri listini):");
    for (const categoria of categorie) {
      lines.push(
        `- ${categoria.nome}: giornata ${money(categoria.costoGiornata)}, trasferta ${money(categoria.indennitaTrasferta)}`
      );
    }
  }

  if (storico.length) {
    lines.push("Preventivi recenti dello stesso cliente (riusa voci/prezzi se coerenti):");
    for (const preventivo of storico) {
      lines.push(
        `- ${preventivo.numeroPreventivo} (${preventivo.stato}):`
      );
      for (const riga of preventivo.righe) {
        lines.push(
          `  • ${riga.descrizione} × ${Number(riga.quantita)} @ ${money(riga.prezzoUnitario)} €`
        );
      }
    }
  }

  return lines.join("\n");
}
