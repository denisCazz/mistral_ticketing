"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import {
  STATO_PREVENTIVO_LABELS,
  STATI_PREVENTIVO_ORDINE,
} from "@/lib/preventivo-constants";
import { StatoPreventivo } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";

interface PreventivoRow {
  id: string;
  numeroPreventivo: string;
  stato: StatoPreventivo;
  totaleFinale: string | null;
  createdAt: string;
  cliente: { id: string; ragioneSociale: string };
  operatore: { id: string; name: string };
}

export default function PreventiviPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      }
    >
      <PreventiviContent />
    </Suspense>
  );
}

function PreventiviContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preventivi, setPreventivi] = useState<PreventivoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);

  const stato = searchParams.get("stato") ?? "";
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const queryKey = `${stato}|${search}|${page}`;
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);
  if (prevQueryKey !== queryKey) {
    setPrevQueryKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (stato) params.set("stato", stato);
    if (search) params.set("search", search);
    params.set("page", String(page));
    fetch(`/api/preventivi?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPreventivi(data.preventivi ?? []);
        setTotalPages(data.totalPages ?? 1);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stato, search, page]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preventivi</h1>
          <p className="text-sm text-gray-500">Bozze AI, export e storico versioni</p>
        </div>
        <Link href="/preventivi/nuovo">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo preventivo
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={!stato ? "default" : "outline"}
          size="sm"
          onClick={() => router.push("/preventivi")}
        >
          Tutti
        </Button>
        {STATI_PREVENTIVO_ORDINE.map((s) => (
          <Button
            key={s}
            variant={stato === s ? "default" : "outline"}
            size="sm"
            onClick={() => router.push(`/preventivi?stato=${s}`)}
          >
            {STATO_PREVENTIVO_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Cerca numero o cliente..."
          value={search}
          onChange={(e) => {
            const q = e.target.value;
            const params = new URLSearchParams();
            if (stato) params.set("stato", stato);
            if (q) params.set("search", q);
            router.push(`/preventivi?${params}`);
          }}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Numero</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Totale</th>
                <th className="px-4 py-3">Operatore</th>
              </tr>
            </thead>
            <tbody>
              {preventivi.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/preventivi/${p.id}`} className="font-medium text-sky-800">
                      {p.numeroPreventivo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.cliente.ragioneSociale}</td>
                  <td className="px-4 py-3">
                    <PreventivoStatoBadge stato={p.stato} />
                  </td>
                  <td className="px-4 py-3">
                    € {Number(p.totaleFinale ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{p.operatore.name}</td>
                </tr>
              ))}
              {preventivi.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nessun preventivo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "outline"}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(p));
                router.push(`/preventivi?${params}`);
              }}
            >
              {p}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
