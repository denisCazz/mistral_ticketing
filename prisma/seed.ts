import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_MARCHE = [
  "Extraflame",
  "Edilkamin",
  "MCZ",
  "Palazzetti",
  "Nordica",
  "Laminox",
  "Klover",
  "Anselmo Cola",
];

async function main() {
  console.log("🌱 Seeding Mistral Impianti...");

  const adminHash = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@mistralimpianti.it" },
    update: {},
    create: {
      name: "Amministratore",
      email: "admin@mistralimpianti.it",
      passwordHash: adminHash,
      role: "ADMIN",
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

  console.log(`✅ Admin: ${admin.email}`);
  console.log("🔑 Password: admin123 (cambiala subito)");
  console.log(`✅ Marche catalogo: ${DEFAULT_MARCHE.length}`);
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
