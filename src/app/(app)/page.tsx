"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatoBadge } from "@/components/stato-badge";
import { STATO_LABELS } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import { Users, FileText, Wrench, ClipboardList } from "lucide-react";
import { useSession } from "next-auth/react";

interface DashboardData {
  perStato: { stato: StatoPratica; _count: { stato: number } }[];
  pratiche: {
    id: string;
    numeroPratica: string;
    stato: StatoPratica;
    createdAt: string;
    cliente: { id: string; ragioneSociale: string };
    operatore: { id: string; name: string };
  }[];
  totaleClienti: number;
  totaleRapportini: number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
      </div>
    );
  }

  const totalePratiche = data.perStato.reduce((s, x) => s + x._count.stato, 0);
  const aperte = data.perStato
    .filter((x) => !["COMPLETATA", "ANNULLATA", "NON_RISOLVIBILE"].includes(x.stato))
    .reduce((s, x) => s + x._count.stato, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Pratiche e rapportini — Mistral Impianti</p>
      </div>

      {/* KPI Cards */}
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
                <p className="text-sm text-gray-500">Pratiche totali</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalePratiche}</p>
              </div>
              <div className="bg-sky-100 p-3 rounded-full">
                <FileText className="h-6 w-6 text-sky-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pratiche aperte</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{aperte}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Wrench className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Link href="/rapportini" className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rapportini</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.totaleRapportini ?? 0}</p>
              </div>
              <div className="bg-emerald-100 p-3 rounded-full">
                <ClipboardList className="h-6 w-6 text-emerald-700" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Per stato */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pratiche per stato</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.perStato.map((s) => (
              <Link
                key={s.stato}
                href={`/pratiche?stato=${s.stato}`}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-colors"
              >
                <span className="text-xs text-gray-600">{STATO_LABELS[s.stato]}</span>
                <span className="text-lg font-bold text-gray-900">{s._count.stato}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ultime pratiche */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultime pratiche aggiornate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            {data.pratiche.map((p) => (
              <Link
                key={p.id}
                href={`/pratiche/${p.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{p.numeroPratica}</p>
                  <p className="text-xs text-gray-500 truncate">{p.cliente.ragioneSociale}</p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <StatoBadge stato={p.stato} />
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {new Date(p.createdAt).toLocaleDateString("it-IT")}
                  </span>
                </div>
              </Link>
            ))}
            {data.pratiche.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">Nessuna pratica ancora</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
