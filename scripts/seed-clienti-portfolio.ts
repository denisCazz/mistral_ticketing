/**
 * Inserisce/aggiorna i clienti del portfolio https://www.mistralimpianti.it/lavori/
 * senza rieseguire l'intero seed (admin, marche, ecc.).
 *
 * Uso: npx tsx --env-file=.env scripts/seed-clienti-portfolio.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { CLIENTI_PORTFOLIO } from "../prisma/data/clienti-portfolio";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`📋 Seed clienti portfolio (${CLIENTI_PORTFOLIO.length})...`);

  let created = 0;
  let updated = 0;

  for (const c of CLIENTI_PORTFOLIO) {
    const data = {
      ragioneSociale: c.ragioneSociale,
      indirizzo: c.indirizzo ?? null,
      cap: c.cap ?? null,
      citta: c.citta ?? null,
      provincia: c.provincia ?? null,
      telFisso: c.telFisso ?? null,
      email: c.email ?? null,
      note1: c.note1 ?? null,
      sourceId: c.sourceId,
    };

    const existing = await prisma.cliente.findFirst({
      where: { sourceId: c.sourceId },
    });

    if (existing) {
      await prisma.cliente.update({ where: { id: existing.id }, data });
      updated++;
      console.log(`  ↻ ${c.ragioneSociale}`);
    } else {
      await prisma.cliente.create({ data });
      created++;
      console.log(`  + ${c.ragioneSociale}`);
    }
  }

  console.log(`✅ Fatto: ${created} creati, ${updated} aggiornati`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
