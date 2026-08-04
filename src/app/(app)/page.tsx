"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import { STATO_PREVENTIVO_LABELS } from "@/lib/preventivo-constants";
import { StatoPreventivo } from "@prisma/client";
import {
  Users,
  FileText,
  CalendarClock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useSession } from "next-auth/react";

interface DashboardData {
  perStato: { stato: StatoPreventivo; _count: { stato: number } }[];
  preventivi: {
    id: string;
    numeroPreventivo: string;
    stato: StatoPreventivo;
    totaleFinale: string | null;
    updatedAt: string;
    cliente: { id: string; ragioneSociale: string };
    operatore: { id: string; name: string };
  }[];
  totaleClienti: number;
  scadenzeProssime: number;
  scadenzeUrgenti: number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetch("/api/dashboard", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Dashboard API error");
        return r.json();
      })
      .then((json: DashboardData) => {
        setData(json);
        setError(false);
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

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
          <p className="font-medium text-gray-900">Impossibile caricare la dashboard</p>
          <p className="mt-1 text-sm text-gray-500">Riprova tra qualche istante.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setData(null);
            setReloadKey((key) => key + 1);
          }}
        >
          <RefreshCw className="size-4" /> Riprova
        </Button>
      </div>
    );
  }

  const totalePreventivi = data.perStato.reduce((s, x) => s + x._count.stato, 0);
  const bozze = data.perStato.find((x) => x.stato === "BOZZA")?._count.stato ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Preventivi, documenti e scadenze</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Clienti totali</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{data.totaleClienti}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Preventivi</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalePreventivi}</p>
              </div>
              <div className="bg-sky-100 p-3 rounded-full">
                <FileText className="h-6 w-6 text-sky-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Link href="/scadenze" className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Scadenze 30gg</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.scadenzeProssime}</p>
              </div>
              <div className="bg-amber-100 p-3 rounded-full">
                <CalendarClock className="h-6 w-6 text-amber-700" />
              </div>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Link href="/scadenze" className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Urgenti ≤7gg</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{data.scadenzeUrgenti}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preventivi per stato</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.perStato.map((s) => (
              <Link
                key={s.stato}
                href={`/preventivi?stato=${s.stato}`}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-sky-200 hover:bg-sky-50 transition-colors"
              >
                <span className="text-xs text-gray-600">{STATO_PREVENTIVO_LABELS[s.stato]}</span>
                <span className="text-lg font-bold text-gray-900">{s._count.stato}</span>
              </Link>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-3">Bozze attive: {bozze}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultimi preventivi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            {data.preventivi.map((p) => (
              <Link
                key={p.id}
                href={`/preventivi/${p.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{p.numeroPreventivo}</p>
                  <p className="text-xs text-gray-500 truncate">{p.cliente.ragioneSociale}</p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <PreventivoStatoBadge stato={p.stato} />
                  <span className="text-xs text-gray-500">
                    € {Number(p.totaleFinale ?? 0).toFixed(2)}
                  </span>
                </div>
              </Link>
            ))}
            {data.preventivi.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">Nessun preventivo</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
