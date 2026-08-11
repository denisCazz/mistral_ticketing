"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Focus, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type {
  DocumentMapGraph,
} from "@/components/documenti-ai/document-map-3d";

const DocumentMap3D = dynamic(
  () => import("@/components/documenti-ai/document-map-3d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(72vh,760px)] min-h-[480px] items-center justify-center rounded-xl bg-slate-950 text-sky-200">
        <Loader2 className="mr-2 animate-spin" />
        Inizializzazione WebGL…
      </div>
    ),
  }
);

type GraphResponse = DocumentMapGraph & {
  truncated: boolean;
  vectorMode: "pgvector" | "json";
};

export default function DocumentMapPanel() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSimilarity, setMinSimilarity] = useState(0.72);
  const [limit, setLimit] = useState(500);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      minSimilarity: String(minSimilarity),
      limit: String(limit),
    });
    if (search.trim()) params.set("search", search.trim());
    if (categories.trim()) params.set("categories", categories.trim());
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [
    categories,
    dateFrom,
    dateTo,
    limit,
    minSimilarity,
    search,
    status,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/documenti-ai/map?${query}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? "Errore caricamento mappa");
        }
        setGraph(data as GraphResponse);
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Errore caricamento mappa"
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, refreshSignal]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Esplora relazioni semantiche
        </h2>
        <p className="text-sm text-slate-500">
          Ogni nodo è un documento; i collegamenti indicano similarità tra
          centroidi embedding.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1 xl:col-span-2">
            <Label htmlFor="map-search">Ricerca</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input
                id="map-search"
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titolo o categoria"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="map-categories">Categorie</Label>
            <Input
              id="map-categories"
              value={categories}
              onChange={(event) => setCategories(event.target.value)}
              placeholder="TECNICO, FORMAZIONE"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="map-status">Stato</Label>
            <select
              id="map-status"
              className="h-8 w-full rounded-lg border bg-white px-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Tutti</option>
              <option value="READY">Ready</option>
              <option value="INDEXING">In elaborazione</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="map-date-from">Dal</Label>
            <Input
              id="map-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="map-date-to">Al</Label>
            <Input
              id="map-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="map-similarity">
              Similarità minima: {minSimilarity.toFixed(2)}
            </Label>
            <input
              id="map-similarity"
              className="w-full accent-sky-600"
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={minSimilarity}
              onChange={(event) =>
                setMinSimilarity(Number(event.target.value))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="map-limit">Nodi massimi</Label>
            <Input
              id="map-limit"
              type="number"
              min={50}
              max={1000}
              step={50}
              value={limit}
              onChange={(event) =>
                setLimit(
                  Math.min(1000, Math.max(50, Number(event.target.value) || 50))
                )
              }
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button
              variant="outline"
              onClick={() => setRefreshSignal((value) => value + 1)}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Aggiorna
            </Button>
            <Button
              variant="outline"
              onClick={() => setResetSignal((value) => value + 1)}
            >
              <Focus />
              Centra
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Badge variant={graph?.vectorMode === "pgvector" ? "default" : "secondary"}>
          {graph?.vectorMode ?? "—"}
        </Badge>
        <span>{graph?.nodes.length ?? 0} nodi</span>
        <span>{graph?.links.length ?? 0} collegamenti</span>
        {graph?.truncated && (
          <span className="text-amber-700">
            Vista limitata ai primi {limit} nodi filtrati.
          </span>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : graph && graph.nodes.length > 0 ? (
        <DocumentMap3D
          graph={graph}
          resetSignal={resetSignal}
          onOpenDocument={(documentoId) =>
            router.push(`/documenti/${documentoId}`)
          }
        />
      ) : (
        <div className="flex min-h-[480px] items-center justify-center rounded-xl border bg-slate-50 text-sm text-slate-500">
          {loading
            ? "Caricamento relazioni…"
            : "Nessun documento indicizzato corrisponde ai filtri."}
        </div>
      )}
    </div>
  );
}
