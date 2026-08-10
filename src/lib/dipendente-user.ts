import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { TariffeDipendente } from "@/lib/presenze";
import { generateTemporaryPassword } from "@/lib/temporary-password";

export { generateTemporaryPassword } from "@/lib/temporary-password";

export const DIPENDENTE_EMAIL_DOMAIN = "mistralimpianti.it";

export function slugPersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
}

export function buildDipendenteLogin(nome: string, cognome: string): string {
  const n = slugPersonName(nome);
  const c = slugPersonName(cognome);
  if (!n || !c) return slugPersonName(`${nome}.${cognome}`) || "dipendente";
  return `${n}.${c}`;
}

export function buildDipendenteEmail(nome: string, cognome: string): string {
  return `${buildDipendenteLogin(nome, cognome)}@${DIPENDENTE_EMAIL_DOMAIN}`;
}

/** Accetta nome.cognome oppure email completa. */
export function normalizeLoginIdentifier(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return value;
  if (value.includes("@")) return value;
  return `${value}@${DIPENDENTE_EMAIL_DOMAIN}`;
}

export function serializeTariffe(row: {
  costoGiornata: unknown;
  indennitaTrasferta: unknown;
  costoMutua: unknown;
  costoPermesso: unknown;
  costoFerie: unknown;
  costoFestivo: unknown;
}): TariffeDipendente {
  return {
    costoGiornata: Number(row.costoGiornata),
    indennitaTrasferta: Number(row.indennitaTrasferta),
    costoMutua: Number(row.costoMutua),
    costoPermesso: Number(row.costoPermesso),
    costoFerie: Number(row.costoFerie),
    costoFestivo: Number(row.costoFestivo),
  };
}

export const CATEGORIE_DIPENDENTE_BASE = [
  { id: "manutentore", nome: "Manutentore" },
  { id: "programmatore", nome: "Programmatore" },
] as const;

export async function ensureCategorieDipendente() {
  const standard = await getOrCreateCostiStandard();
  await Promise.all(
    CATEGORIE_DIPENDENTE_BASE.map((categoria) =>
      prisma.categoriaDipendente.upsert({
        where: { id: categoria.id },
        create: {
          ...categoria,
          sistema: true,
          ...standard,
        },
        update: {},
      })
    )
  );
}

export async function getTariffeCategoria(
  categoriaId: string
): Promise<TariffeDipendente> {
  await ensureCategorieDipendente();
  const categoria = await prisma.categoriaDipendente.findUnique({
    where: { id: categoriaId },
  });
  if (categoria) return serializeTariffe(categoria);

  const fallback = await prisma.categoriaDipendente.findUniqueOrThrow({
    where: { id: "manutentore" },
  });
  return serializeTariffe(fallback);
}

export async function getOrCreateCostiStandard(): Promise<TariffeDipendente> {
  let settings = await prisma.aziendaSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    settings = await prisma.aziendaSettings.create({
      data: { id: "default", nomeAzienda: "Mistral Impianti" },
    });
  }
  return serializeTariffe(settings);
}

async function uniqueEmailFor(nome: string, cognome: string): Promise<string> {
  const base = buildDipendenteEmail(nome, cognome);
  const [local, domain] = base.split("@");
  let candidate = base;
  let i = 2;
  while (await prisma.user.findUnique({ where: { email: candidate } })) {
    candidate = `${local}${i}@${domain}`;
    i += 1;
    if (i > 50) throw new Error("Impossibile generare email univoca");
  }
  return candidate;
}

export async function ensureUserForDipendente(dipendente: {
  id: string;
  nome: string;
  cognome: string;
  userId: string | null;
}): Promise<{
  userId: string;
  email: string;
  created: boolean;
  temporaryPassword?: string;
}> {
  if (dipendente.userId) {
    const existing = await prisma.user.findUnique({
      where: { id: dipendente.userId },
      select: { id: true, email: true },
    });
    if (existing) {
      return { userId: existing.id, email: existing.email, created: false };
    }
  }

  const email = await uniqueEmailFor(dipendente.nome, dipendente.cognome);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const name = `${dipendente.nome} ${dipendente.cognome}`.trim();

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "OPERATORE",
      active: true,
      mustChangePassword: true,
    },
    select: { id: true, email: true },
  });

  await prisma.dipendente.update({
    where: { id: dipendente.id },
    data: { userId: user.id },
  });

  return {
    userId: user.id,
    email: user.email,
    created: true,
    temporaryPassword,
  };
}

export function weekdayDatesInMonth(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dow = date.getUTCDay(); // 0 Sun … 6 Sat
    if (dow >= 1 && dow <= 5) dates.push(date);
  }
  return dates;
}

/** Precompila i feriali vuoti con SEDE (non sovrascrive celle già impostate). */
export async function prefillSedeWeekdays(opts: {
  year: number;
  month: number;
  dipendenteIds: string[];
}): Promise<number> {
  if (opts.dipendenteIds.length === 0) return 0;
  const dates = weekdayDatesInMonth(opts.year, opts.month);
  if (dates.length === 0) return 0;

  const data = opts.dipendenteIds.flatMap((dipendenteId) =>
    dates.map((dataGiorno) => ({
      dipendenteId,
      data: dataGiorno,
      tipo: "SEDE" as const,
    }))
  );

  const result = await prisma.presenzaGiorno.createMany({
    data,
    skipDuplicates: true,
  });
  return result.count;
}

export async function ensureUsersForDipendenti(
  dipendenti: {
    id: string;
    nome: string;
    cognome: string;
    userId: string | null;
  }[]
): Promise<void> {
  const missing = dipendenti.filter((d) => !d.userId);
  if (missing.length === 0) return;

  let index = 0;
  async function worker() {
    while (index < missing.length) {
      const current = missing[index++];
      await ensureUserForDipendente(current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(2, missing.length) }, () => worker())
  );
}
