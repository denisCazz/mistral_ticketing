"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import {
  STATO_PREVENTIVO_LABELS,
  STATI_PREVENTIVO_ORDINE,
} from "@/lib/preventivo-constants";
import type { StatoPreventivo } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreventivoListItem = {
  id: string;
  numeroPreventivo: string;
  stato: StatoPreventivo;
  totaleFinale: string | number | null;
  cliente: { id: string; ragioneSociale: string };
  operatore: { id: string; name: string };
};

export function PreventiviView({
  preventivi,
  totalPages,
  page,
  stato,
  search,
}: {
  preventivi: PreventivoListItem[];
  totalPages: number;
  page: number;
  stato: string;
  search: string;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);

  function pushFilters(next: { stato?: string; search?: string; page?: number }) {
    const params = new URLSearchParams();
    const nextStato = next.stato ?? stato;
    const nextSearch = next.search ?? searchInput;
    const nextPage = next.page ?? 1;
    if (nextStato) params.set("stato", nextStato);
    if (nextSearch) params.set("search", nextSearch);
    if (nextPage > 1) params.set("page", String(nextPage));
    router.push(`/preventivi?${params}`);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preventivi</h1>
          <p className="text-sm text-gray-500">
            Bozze AI, export e storico versioni
          </p>
        </div>
        <Link href="/preventivi/nuovo">
          <Button>
            <Plus className="h-4 w-4 mr-2" aria-hidden />
            Nuovo preventivo
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={!stato ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSearchInput(search);
            router.push(
              search ? `/preventivi?search=${encodeURIComponent(search)}` : "/preventivi"
            );
          }}
        >
          Tutti
        </Button>
        {STATI_PREVENTIVO_ORDINE.map((s) => (
          <Button
            key={s}
            variant={stato === s ? "default" : "outline"}
            size="sm"
            onClick={() => pushFilters({ stato: s, search, page: 1 })}
          >
            {STATO_PREVENTIVO_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Cerca numero o cliente..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              pushFilters({ search: searchInput, page: 1 });
            }
          }}
        />
      </div>

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
                  <Link
                    href={`/preventivi/${p.id}`}
                    className="font-medium text-sky-800"
                  >
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

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            if (stato) params.set("stato", stato);
            if (search) params.set("search", search);
            if (p > 1) params.set("page", String(p));
            return (
              <Link
                key={p}
                href={`/preventivi?${params}`}
                className={cn(
                  buttonVariants({
                    size: "sm",
                    variant: p === page ? "default" : "outline",
                  })
                )}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
