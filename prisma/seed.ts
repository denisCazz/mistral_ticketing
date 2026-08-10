import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { CLIENTI_PORTFOLIO } from "./data/clienti-portfolio";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_MARCHE = [
  // Antincendio
  "ANAF",
  "Gloria",
  "Emme Antincendio",
  "Kidde",
  "Firex",
  // Elettrico
  "ABB",
  "Schneider Electric",
  "Bticino",
  "Gewiss",
  "Siemens",
  "Legrand",
];

async function seedClientiPortfolio() {
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
    } else {
      await prisma.cliente.create({ data });
      created++;
    }
  }

  return { created, updated };
}

async function main() {
  console.log("🌱 Seeding Mistral Impianti...");

  const isProd = process.env.NODE_ENV === "production";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    if (isProd) {
      throw new Error(
        "SEED_ADMIN_PASSWORD obbligatorio in produzione (niente password predefinite)."
      );
    }
    throw new Error(
      "Imposta SEED_ADMIN_PASSWORD nell'ambiente prima di eseguire il seed."
    );
  }
  if (adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD deve avere almeno 12 caratteri.");
  }

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@mistralimpianti.it" },
    update: {},
    create: {
      name: "Amministratore",
      email: "admin@mistralimpianti.it",
      passwordHash: adminHash,
      role: "ADMIN",
      mustChangePassword: true,
    },
  });

  await prisma.aziendaSettings.upsert({
    where: { id: "default" },
    update: { nomeAzienda: "Mistral Impianti" },
    create: {
      id: "default",
      nomeAzienda: "Mistral Impianti",
    },
  });

  for (const nome of DEFAULT_MARCHE) {
    await prisma.marca.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }

  const clienti = await seedClientiPortfolio();

  console.log(`✅ Admin: ${admin.email}`);
  console.log("🔑 Password: (SEED_ADMIN_PASSWORD) — cambiala al primo accesso");
  console.log(`✅ Marche catalogo: ${DEFAULT_MARCHE.length}`);
  console.log(
    `✅ Clienti portfolio lavori: ${CLIENTI_PORTFOLIO.length} (${clienti.created} creati, ${clienti.updated} aggiornati)`
  );
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
