import { prisma } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAlertEmails(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const email = String(item ?? "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) return null;
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export async function getOrCreateAziendaSettings() {
  let settings = await prisma.aziendaSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    settings = await prisma.aziendaSettings.create({
      data: { id: "default", nomeAzienda: "Mistral Impianti" },
    });
  }
  return settings;
}

/** Destinatari alert scadenze: email configurate + (opzionale) admin attivi. */
export async function resolveAlertDestinatari(): Promise<
  Array<{ email: string; name: string }>
> {
  const settings = await getOrCreateAziendaSettings();
  const map = new Map<string, { email: string; name: string }>();

  for (const email of settings.alertEmails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) continue;
    map.set(normalized, { email: normalized, name: normalized });
  }

  if (settings.alertIncludiAdmin) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { email: true, name: true },
    });
    for (const admin of admins) {
      const key = admin.email.trim().toLowerCase();
      map.set(key, { email: admin.email, name: admin.name });
    }
  }

  return [...map.values()];
}
