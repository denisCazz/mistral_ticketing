import { prisma } from "@/lib/db";
import { normalizePhone, type ClienteRow } from "@/lib/xlsx-parser";

function clienteData(row: ClienteRow) {
  return {
    ragioneSociale: row.ragioneSociale,
    indirizzo: row.indirizzo,
    cap: row.cap,
    citta: row.citta,
    provincia: row.provincia,
    telFisso: row.telFisso,
    cellulare: row.cellulare,
    email: row.email,
    note1: row.note1,
    note2: row.note2,
    note3: row.note3,
    statoAnagrafica: row.statoAnagrafica,
    motivoControllo: row.motivoControllo,
    sourceId: row.id,
  };
}

export async function findExistingCliente(row: ClienteRow) {
  if (row.id) {
    const bySource = await prisma.cliente.findFirst({ where: { sourceId: row.id } });
    if (bySource) return bySource;
  }

  if (row.email) {
    const byEmail = await prisma.cliente.findFirst({
      where: { email: { equals: row.email, mode: "insensitive" } },
    });
    if (byEmail) return byEmail;
  }

  const phone = normalizePhone(row.cellulare);
  if (phone.length >= 8) {
    const suffix = phone.slice(-9);
    const byPhone = await prisma.cliente.findFirst({
      where: {
        OR: [
          { cellulare: { contains: suffix } },
          { telFisso: { contains: suffix } },
        ],
      },
    });
    if (byPhone) return byPhone;
  }

  if (row.ragioneSociale && row.citta) {
    const byName = await prisma.cliente.findFirst({
      where: {
        ragioneSociale: { equals: row.ragioneSociale, mode: "insensitive" },
        citta: { equals: row.citta, mode: "insensitive" },
      },
    });
    if (byName) return byName;
  }

  return null;
}

export async function upsertCliente(
  row: ClienteRow
): Promise<{ action: "created" | "updated"; cliente: { id: string } }> {
  const existing = await findExistingCliente(row);
  const data = clienteData(row);

  if (existing) {
    const cliente = await prisma.cliente.update({ where: { id: existing.id }, data });
    return { action: "updated", cliente };
  }

  const cliente = await prisma.cliente.create({ data });
  return { action: "created", cliente };
}
