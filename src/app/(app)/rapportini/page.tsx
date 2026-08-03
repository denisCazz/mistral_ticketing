"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { RapportinoDTO } from "@/types/rapportino";
import { TIPOLOGIA_INTERVENTO_LABELS } from "@/lib/rapportino-constants";
import { cn } from "@/lib/utils";

export default function RapportiniPage() {
  const [items, setItems] = useState<RapportinoDTO[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    setLoading(true);
    fetch(`/api/rapportini?${q}`)
      .then((r) => r.json())
      .then((json) => {
        setItems(json.data || []);
        setTotal(json.total || 0);
      })
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapportini</h1>
          <p className="text-sm text-gray-500 mt-1">
            Schede intervento stufe · {total} totali
          </p>
        </div>
        <Link
          href="/rapportini/nuovo"
          className={cn(buttonVariants(), "bg-sky-700 hover:bg-sky-800")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo rapportino
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Cerca cliente, marca, modello…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            Nessun rapportino trovato.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Link key={r.id} href={`/rapportini/${r.id}`}>
              <Card className="hover:border-sky-300 transition-colors cursor-pointer mb-3">
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {r.cliente?.ragioneSociale || "Cliente"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {r.marca} {r.modello} · {r.tipoStufa}
                      {r.tipologiaIntervento &&
                      r.tipologiaIntervento in TIPOLOGIA_INTERVENTO_LABELS
                        ? ` · ${TIPOLOGIA_INTERVENTO_LABELS[r.tipologiaIntervento as keyof typeof TIPOLOGIA_INTERVENTO_LABELS]}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 sm:text-right">
                    <p>{r.dataIntervento}</p>
                    <p>{r.utente?.name}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
