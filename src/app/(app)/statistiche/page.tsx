"use client";

import { useEffect, useState, type ElementType } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import { StatoPreventivo } from "@prisma/client";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeEuro,
  CirclePercent,
  FileText,
  RefreshCw,
  Timer,
  UserCog,
  Users,
  WalletCards,
} from "lucide-react";

interface Conteggio {
  id?: string | null;
  label: string;
  count: number;
  value: number;
}

interface StatsData {
  periodo: { mesi: number; dal: string; al: string };
  isAdmin: boolean;
  totali: {
    preventivi: number;
    aperte: number;
    chiuse: number;
    clienti: number;
    operatori: number;
    tempoMedioGiorni: number | null;
    valoreTotale: number;
    valoreAccettato: number;
    valoreMedio: number;
    tassoAccettazione: number | null;
  };
  confronto: {
    preventivi: number | null;
    valore: number | null;
  };
  perStato: { stato: StatoPreventivo; count: number }[];
  perOperatore: Conteggio[];
  perMese: { key: string; label: string; count: number; value: number }[];
}

const PERIODI = [3, 6, 12, 24] as const;
const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function Trend({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground">Nessun confronto</span>;
  }
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      <Icon className="size-3.5" />
      {Math.abs(value).toFixed(1)}% sul periodo precedente
    </span>
  );
}

function BarList({ items }: { items: Conteggio[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato</p>;
  }
  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <div key={item.id ?? item.label ?? idx} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="shrink-0 text-muted-foreground">
              {item.count} · <strong className="text-foreground">{euro.format(item.value)}</strong>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width]"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  detail,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  tone: string;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="relative min-h-36">
      <CardContent className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground">
              {value}
            </p>
          </div>
          <div className={`shrink-0 rounded-xl p-2.5 ${tone}`}>
            <Icon className="size-5" />
          </div>
        </div>
        {detail && <div className="mt-3">{detail}</div>}
      </CardContent>
    </Card>
  );
}

export default function StatistichePage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [mesi, setMesi] = useState<(typeof PERIODI)[number]>(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [metricaGrafico, setMetricaGrafico] = useState<"count" | "value">("count");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/statistiche?mesi=${mesi}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Statistiche API error");
        return response.json();
      })
      .then(setData)
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mesi, reloadKey]);

  if (loading && !data) {
    return (
      <div className="flex min-h-80 items-center justify-center p-8">
        <RefreshCw className="size-7 animate-spin text-sky-700" />
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <p className="font-medium">Impossibile caricare le statistiche</p>
          <p className="mt-1 text-sm text-muted-foreground">Riprova tra qualche istante.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(false);
            setReloadKey((key) => key + 1);
          }}
        >
          <RefreshCw className="size-4" /> Riprova
        </Button>
      </div>
    );
  }

  const maxMese = Math.max(
    1,
    ...data.perMese.map((m) => m[metricaGrafico])
  );
  const tempoMedio =
    data.totali.tempoMedioGiorni != null
      ? `${data.totali.tempoMedioGiorni.toFixed(1)} gg`
      : "—";
  const periodoLabel = `${new Date(data.periodo.dal).toLocaleDateString("it-IT", {
    month: "short",
    year: "numeric",
  })} – oggi`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiche</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Andamento commerciale · {periodoLabel}
          </p>
        </div>
        <div className="inline-flex w-fit rounded-lg bg-muted p-1">
          {PERIODI.map((periodo) => (
            <button
              key={periodo}
              type="button"
              onClick={() => {
                if (periodo === mesi) return;
                setLoading(true);
                setError(false);
                setMesi(periodo);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mesi === periodo
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {periodo} mesi
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        <Kpi
          label="Preventivi creati"
          value={data.totali.preventivi}
          icon={FileText}
          tone="bg-sky-100 text-sky-700"
          detail={<Trend value={data.confronto.preventivi} />}
        />
        <Kpi
          label="Valore preventivi"
          value={euro.format(data.totali.valoreTotale)}
          icon={WalletCards}
          tone="bg-indigo-100 text-indigo-700"
          detail={<Trend value={data.confronto.valore} />}
        />
        <Kpi
          label="Valore accettato"
          value={euro.format(data.totali.valoreAccettato)}
          icon={BadgeEuro}
          tone="bg-emerald-100 text-emerald-700"
          detail={
            <span className="text-xs text-muted-foreground">
              Su {euro.format(data.totali.valoreTotale)} proposti
            </span>
          }
        />
        <Kpi
          label="Tasso di accettazione"
          value={
            data.totali.tassoAccettazione == null
              ? "—"
              : `${data.totali.tassoAccettazione.toFixed(1)}%`
          }
          icon={CirclePercent}
          tone="bg-violet-100 text-violet-700"
          detail={<span className="text-xs text-muted-foreground">Accettati sugli esiti definitivi</span>}
        />
        <Kpi
          label="Valore medio"
          value={euro.format(data.totali.valoreMedio)}
          icon={BadgeEuro}
          tone="bg-amber-100 text-amber-700"
          detail={<span className="text-xs text-muted-foreground">Per preventivo</span>}
        />
        <Kpi
          label="Tempo medio accettazione"
          value={tempoMedio}
          icon={Timer}
          tone="bg-slate-100 text-slate-700"
          detail={<span className="text-xs text-muted-foreground">Dalla creazione al primo sì</span>}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Andamento mensile</CardTitle>
            <CardDescription>
              {metricaGrafico === "count" ? "Numero di preventivi creati" : "Valore dei preventivi creati"}
            </CardDescription>
          </div>
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMetricaGrafico("count")}
              className={`rounded-md px-2.5 py-1 text-xs ${metricaGrafico === "count" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Quantità
            </button>
            <button
              type="button"
              onClick={() => setMetricaGrafico("value")}
              className={`rounded-md px-2.5 py-1 text-xs ${metricaGrafico === "value" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Valore
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1">
            <div className="flex h-56 min-w-[680px] items-end gap-2 border-b border-border px-1">
              {data.perMese.map((m) => {
                const valore = m[metricaGrafico];
                const formatted = metricaGrafico === "count" ? String(valore) : euro.format(valore);
                return (
                  <div key={m.key} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-medium text-foreground">
                      {valore > 0 ? formatted : ""}
                    </span>
                    <div
                      className="min-h-0.5 w-full rounded-t-md bg-sky-500 transition-all hover:bg-sky-600"
                      style={{ height: `${(valore / maxMese) * 100}%` }}
                      title={`${m.label}: ${formatted}`}
                    />
                    <span className="whitespace-nowrap pb-2 text-[10px] text-muted-foreground">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Distribuzione per stato</CardTitle>
            <CardDescription>
              {data.totali.aperte} aperti · {data.totali.chiuse} chiusi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.perStato.map((s) => (
                <Link
                  key={s.stato}
                  href={`/preventivi?stato=${s.stato}`}
                  className="group rounded-lg border border-border p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                >
                  <div className="flex items-center justify-between">
                    <PreventivoStatoBadge stato={s.stato} />
                    <span className="text-lg font-bold">{s.count}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{
                        width: `${data.totali.preventivi ? (s.count / data.totali.preventivi) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {data.isAdmin ? <UserCog className="size-4" /> : <Users className="size-4" />}
              {data.isAdmin ? "Performance operatori" : "La tua attività"}
            </CardTitle>
            <CardDescription>
              {data.totali.clienti} clienti coinvolti
              {data.isAdmin ? ` · ${data.totali.operatori} operatori` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={data.perOperatore} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
