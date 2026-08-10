import Link from "next/link";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { StatoPreventivo } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FilePlus2,
  FileText,
  FolderOpen,
  Package,
  Plus,
  ScanLine,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import { RefreshPageButton } from "@/components/refresh-page-button";
import {
  STATO_PREVENTIVO_LABELS,
  STATI_PREVENTIVO_ORDINE,
} from "@/lib/preventivo-constants";
import { formatEuro } from "@/lib/presenze";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/dashboard-queries";

function formatoData(value: string | Date) {
  try {
    const d =
      value instanceof Date
        ? value
        : value.length === 10
          ? parseISO(value)
          : new Date(value);
    return format(d, "d MMM yyyy", { locale: it });
  } catch {
    return String(value).slice(0, 10);
  }
}

function urgenzaStyle(giorni: number) {
  if (giorni < 0) {
    return {
      label: `Scaduta da ${Math.abs(giorni)}g`,
      badge: "border-red-200 bg-red-50 text-red-700",
      bar: "bg-red-500",
    };
  }
  if (giorni <= 1) {
    return {
      label: giorni === 0 ? "Oggi" : "Domani",
      badge: "border-red-200 bg-red-50 text-red-700",
      bar: "bg-red-500",
    };
  }
  if (giorni <= 7) {
    return {
      label: `${giorni} giorni`,
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      bar: "bg-orange-500",
    };
  }
  return {
    label: `${giorni} giorni`,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    bar: "bg-amber-400",
  };
}

function KpiCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
  valueClass,
}: {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone: string;
  valueClass?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:border-sky-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p
            className={cn(
              "mt-2 text-3xl font-semibold tracking-tight text-slate-950",
              valueClass
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <div className={cn("shrink-0 rounded-xl p-2.5", tone)}>
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-sky-700 opacity-0 transition group-hover:opacity-100">
        Apri <ArrowRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}

export function DashboardView({
  data,
  firstName,
  isAdmin,
}: {
  data: DashboardData;
  firstName: string;
  isAdmin: boolean;
}) {
  const countByStato = Object.fromEntries(
    data.perStato.map((s) => [s.stato, s._count.stato])
  ) as Partial<Record<StatoPreventivo, number>>;
  const totalePreventivi = data.perStato.reduce((s, x) => s + x._count.stato, 0);
  const maxStato = Math.max(1, ...data.perStato.map((s) => s._count.stato));
  const attention =
    data.scadenzeScadute +
    data.scadenzeUrgenti +
    data.magazzinoSottoSoglia +
    data.documentiDaClassificare;

  return (
    <div className="min-h-full bg-slate-50/70">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Mistral Impianti
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Ciao, {firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {attention > 0
                ? `${attention} elementi richiedono attenzione`
                : "Tutto sotto controllo"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/preventivi/nuovo"
              className={cn(buttonVariants(), "bg-sky-700 hover:bg-sky-800")}
            >
              <Plus className="size-4" aria-hidden />
              Nuovo preventivo
            </Link>
            <RefreshPageButton />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            href="/scadenze"
            label="Urgenti ≤7gg"
            value={data.scadenzeUrgenti}
            hint={
              data.scadenzeScadute > 0
                ? `${data.scadenzeScadute} già scadute`
                : `${data.scadenzeProssime} nei prossimi 90gg`
            }
            icon={AlertTriangle}
            tone="bg-red-50 text-red-600"
            valueClass={data.scadenzeUrgenti > 0 ? "text-red-600" : undefined}
          />
          <KpiCard
            href="/preventivi"
            label="Preventivi aperti"
            value={data.preventiviAperti.count}
            hint={
              data.preventiviAperti.valore > 0
                ? formatEuro(data.preventiviAperti.valore)
                : `${totalePreventivi} totali`
            }
            icon={FileText}
            tone="bg-sky-50 text-sky-700"
          />
          <KpiCard
            href="/scadenze?tab=da-classificare"
            label="Doc. da classificare"
            value={data.documentiDaClassificare}
            hint="Senza data scadenza"
            icon={FolderOpen}
            tone="bg-amber-50 text-amber-700"
            valueClass={
              data.documentiDaClassificare > 0 ? "text-amber-700" : undefined
            }
          />
          <KpiCard
            href="/magazzino?lowStock=1"
            label="Magazzino basso"
            value={data.magazzinoSottoSoglia}
            hint="Sotto soglia minima"
            icon={Warehouse}
            tone="bg-orange-50 text-orange-700"
            valueClass={
              data.magazzinoSottoSoglia > 0 ? "text-orange-700" : undefined
            }
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isAdmin && (
            <Link
              href="/clienti"
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-sky-300"
            >
              <span className="rounded-xl bg-blue-50 p-2 text-blue-600">
                <Users className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block font-medium text-slate-950">
                  {data.totaleClienti} clienti
                </span>
                <span className="text-xs text-slate-500">Anagrafica completa</span>
              </span>
            </Link>
          )}
          <Link
            href="/preventivi?stato=BOZZA"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-sky-300"
          >
            <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
              <FilePlus2 className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block font-medium text-slate-950">
                {countByStato.BOZZA ?? 0} bozze
              </span>
              <span className="text-xs text-slate-500">Da completare</span>
            </span>
          </Link>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Azioni rapide</h2>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/preventivi/nuovo", label: "Nuovo preventivo", icon: Plus },
              {
                href: "/magazzino/scansione",
                label: "Scansione magazzino",
                icon: ScanLine,
              },
              {
                href: "/scadenze",
                label: "Gestisci scadenze",
                icon: CalendarClock,
              },
              { href: "/documenti", label: "Apri documenti", icon: FolderOpen },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-3 bg-white px-5 py-4 text-sm font-medium text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
                >
                  <Icon className="size-4 shrink-0 text-sky-700" aria-hidden />
                  {a.label}
                </Link>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Preventivi per stato</CardTitle>
              <CardDescription>
                {data.preventiviAperti.count} aperti ·{" "}
                {formatEuro(data.preventiviAperti.valore)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {STATI_PREVENTIVO_ORDINE.map((stato) => {
                const count = countByStato[stato] ?? 0;
                return (
                  <Link
                    key={stato}
                    href={`/preventivi?stato=${stato}`}
                    className="block rounded-lg border border-transparent p-2 transition hover:border-sky-200 hover:bg-sky-50/60"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">
                        {STATO_PREVENTIVO_LABELS[stato]}
                      </span>
                      <span className="text-sm font-semibold text-slate-950">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${(count / maxStato) * 100}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Scadenze imminenti</CardTitle>
                <CardDescription>
                  {data.scadenzeScadute > 0
                    ? `${data.scadenzeScadute} scadute · `
                    : ""}
                  {data.scadenzeProssime} nei prossimi 90 giorni
                </CardDescription>
              </div>
              <Link
                href="/scadenze"
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Vedi tutte
              </Link>
            </CardHeader>
            <CardContent>
              {data.scadenze.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Nessuna scadenza nelle prossime settimane
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.scadenze.map((s) => {
                    const u = urgenzaStyle(s.giorniRimanenti);
                    const who = s.dipendente
                      ? `${s.dipendente.cognome} ${s.dipendente.nome}`
                      : s.automezzo?.targa;
                    return (
                      <div
                        key={s.id}
                        className="relative flex items-center justify-between gap-3 py-3 pl-3"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-y-3 left-0 w-1 rounded-full",
                            u.bar
                          )}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-950">
                            {s.titolo}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {formatoData(s.dataScadenza)}
                            {who ? ` · ${who}` : ""}
                            {s.documento
                              ? ` · ${s.documento.titoloOriginale}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            u.badge
                          )}
                        >
                          {u.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Ultimi preventivi</CardTitle>
                <CardDescription>Aggiornati di recente</CardDescription>
              </div>
              <Link
                href="/preventivi"
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Tutti
              </Link>
            </CardHeader>
            <CardContent>
              {data.preventivi.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Nessun preventivo
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.preventivi.map((p) => (
                    <Link
                      key={p.id}
                      href={`/preventivi/${p.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-950">
                          {p.numeroPreventivo}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {p.cliente.ragioneSociale}
                          {isAdmin ? ` · ${p.operatore.name}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PreventivoStatoBadge stato={p.stato} />
                        <span className="w-20 text-right text-xs tabular-nums text-slate-600">
                          {formatEuro(Number(p.totaleFinale ?? 0))}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Magazzino sotto soglia</CardTitle>
                <CardDescription>
                  {data.magazzinoSottoSoglia > 0
                    ? `${data.magazzinoSottoSoglia} articoli da riassortire`
                    : "Giacenze ok"}
                </CardDescription>
              </div>
              <Link
                href="/magazzino?lowStock=1"
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Magazzino
              </Link>
            </CardHeader>
            <CardContent>
              {data.magazzinoAlert.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Package className="size-8 text-emerald-500/70" aria-hidden />
                  <p className="text-sm text-slate-500">
                    Nessun articolo sotto soglia
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.magazzinoAlert.map((a) => (
                    <Link
                      key={a.id}
                      href={`/magazzino/${a.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="rounded-lg bg-orange-50 p-2 text-orange-600">
                          <Package className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-950">
                            {a.nome}
                          </p>
                          <p className="text-xs text-slate-500">{a.codice}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-orange-700">
                        {a.quantita} / {a.sogliaMinima} {a.unitaMisura}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
