"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatoBadge } from "@/components/stato-badge";
import { STATO_LABELS } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import { FileText, FolderOpen, CheckCircle2, Users, UserCog, Timer } from "lucide-react";

interface Conteggio {
  id?: string | null;
  label: string;
  count: number;
}

interface StatsData {
  totali: {
    pratiche: number;
    aperte: number;
    chiuse: number;
    clienti: number;
    operatori: number;
    tempoMedioGiorni: number | null;
  };
  perStato: { stato: StatoPratica; count: number }[];
  perOperatore: Conteggio[];
  perMese: { key: string; label: string; count: number }[];
}

function BarList({ items, colorClass = "bg-orange-500" }: { items: Conteggio[]; colorClass?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 py-2">Nessun dato</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => (
        <div key={item.id ?? item.label ?? idx} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 truncate pr-2">{item.label}</span>
            <span className="font-semibold text-gray-900 shrink-0">{item.count}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass}`}
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
  iconBg,
  iconColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
          <div className={`${iconBg} p-3 rounded-full`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatistichePage() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/statistiche")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  const maxMese = Math.max(1, ...data.perMese.map((m) => m.count));
  const tempoMedio =
    data.totali.tempoMedioGiorni != null
      ? `${data.totali.tempoMedioGiorni.toFixed(1)} gg`
      : "—";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statistiche</h1>
        <p className="text-sm text-gray-500 mt-1">Analisi delle pratiche di manutenzione</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi label="Pratiche totali" value={data.totali.pratiche} icon={FileText} iconBg="bg-orange-100" iconColor="text-orange-500" />
        <Kpi label="Aperte" value={data.totali.aperte} icon={FolderOpen} iconBg="bg-yellow-100" iconColor="text-yellow-600" />
        <Kpi label="Chiuse" value={data.totali.chiuse} icon={CheckCircle2} iconBg="bg-green-100" iconColor="text-green-600" />
        <Kpi label="Clienti" value={data.totali.clienti} icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <Kpi label="Operatori" value={data.totali.operatori} icon={UserCog} iconBg="bg-purple-100" iconColor="text-purple-600" />
        <Kpi label="Tempo medio risol." value={tempoMedio} icon={Timer} iconBg="bg-gray-100" iconColor="text-gray-600" />
      </div>

      {/* Andamento mensile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pratiche aperte per mese (ultimi 12 mesi)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-48">
            {data.perMese.map((m) => (
              <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-xs font-medium text-gray-700">{m.count > 0 ? m.count : ""}</span>
                <div
                  className="w-full rounded-t bg-orange-400 hover:bg-orange-500 transition-colors min-h-[2px]"
                  style={{ height: `${(m.count / maxMese) * 100}%` }}
                  title={`${m.label}: ${m.count}`}
                />
                <span className="text-[10px] text-gray-500 whitespace-nowrap">{m.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per stato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pratiche per stato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.perStato.map((s) => (
                <Link
                  key={s.stato}
                  href={`/pratiche?stato=${s.stato}`}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-colors"
                >
                  <StatoBadge stato={s.stato} />
                  <span className="text-lg font-bold text-gray-900">{s.count}</span>
                </Link>
              ))}
              {data.perStato.length === 0 && (
                <p className="text-sm text-gray-400">Nessun dato</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Per operatore */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Pratiche per operatore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={data.perOperatore} colorClass="bg-blue-500" />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-gray-400">
        Legenda stati:{" "}
        {data.perStato.map((s) => STATO_LABELS[s.stato]).join(" · ")}
      </p>
    </div>
  );
}
