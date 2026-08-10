"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SkipForward,
  Loader2,
  Play,
  Square,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Stats = {
  totale: number;
  inCoda: number;
  senzaTesto: number;
  daStrutturare: number;
  strutturati: number;
  daIndicizzareRag: number;
  indicizzatiRag: number;
  daRevisionare: number;
  failed: number;
  openaiConfigured: boolean;
  r2Configured: boolean;
};

type RowStatus = "OK" | "SKIP" | "REVIEW" | "FAIL";

type LogRow = {
  id: string;
  titolo: string;
  categoria: string;
  status: RowStatus;
  textSource?: string | null;
  decision?: string | null;
  dataScadenza?: string | null;
  chunksIndexed?: number;
  rag?: string | null;
  error?: string;
  ms: number;
  at: string;
};

const STATUS_STYLE: Record<
  RowStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  OK: {
    label: "OK",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    Icon: CheckCircle2,
  },
  REVIEW: {
    label: "REVIEW",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: AlertTriangle,
  },
  SKIP: {
    label: "SKIP",
    className: "bg-slate-50 text-slate-700 border-slate-200",
    Icon: SkipForward,
  },
  FAIL: {
    label: "FAIL",
    className: "bg-red-50 text-red-800 border-red-200",
    Icon: XCircle,
  },
};

export default function DocumentiAiAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [batchSize, setBatchSize] = useState(5);
  const [force, setForce] = useState(false);
  const [enableOcr, setEnableOcr] = useState(true);
  const [enableStructure, setEnableStructure] = useState(true);
  const [enableRag, setEnableRag] = useState(true);
  const [autoContinue, setAutoContinue] = useState(true);
  const [sessionTotals, setSessionTotals] = useState({
    ok: 0,
    review: 0,
    skip: 0,
    fail: 0,
    processed: 0,
    chunksIndexed: 0,
  });

  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const refreshStats = useCallback(async () => {
    const res = await fetch("/api/admin/documenti-ai");
    if (!res.ok) {
      throw new Error("stats");
    }
    const data = (await res.json()) as Stats;
    setStats(data);
    return data;
  }, []);

  const [statsTick, setStatsTick] = useState(0);
  const [prevStatsTick, setPrevStatsTick] = useState(statsTick);
  if (prevStatsTick !== statsTick) {
    setPrevStatsTick(statsTick);
    setLoadingStats(true);
  }

  useEffect(() => {
    let cancelled = false;
    // Caricamento iniziale/refresh stats admin: setState dopo await è intenzionale.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount/tick
    void refreshStats()
      .catch(() => {
        if (!cancelled) toast.error("Errore caricamento statistiche");
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshStats, statsTick]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function runOneBatch(currentForce: boolean) {
    const res = await fetch("/api/admin/documenti-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: batchSize,
        force: currentForce,
        enableOcr,
        enableStructure,
        enableRag,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Errore elaborazione batch");
    }
    return res.json() as Promise<{
      results: Array<Omit<LogRow, "at">>;
      summary: {
        processed: number;
        ok: number;
        review: number;
        skip: number;
        fail: number;
        chunksIndexed: number;
      };
      stats: Stats;
    }>;
  }

  async function startProcessing() {
    if (running) return;
    if (!stats?.openaiConfigured && (enableStructure || enableRag || enableOcr)) {
      toast.error("OPENAI_API_KEY non configurata");
      return;
    }

    stopRef.current = false;
    setRunning(true);

    try {
      let loops = 0;
      while (!stopRef.current && loops < 500) {
        loops += 1;
        const data = await runOneBatch(force);
        setStats(data.stats);

        const stamped = data.results.map((r) => ({
          ...r,
          at: new Date().toISOString(),
        }));
        setLogs((prev) => [...stamped, ...prev].slice(0, 500));
        setSessionTotals((prev) => ({
          ok: prev.ok + data.summary.ok,
          review: prev.review + data.summary.review,
          skip: prev.skip + data.summary.skip,
          fail: prev.fail + data.summary.fail,
          processed: prev.processed + data.summary.processed,
          chunksIndexed: prev.chunksIndexed + (data.summary.chunksIndexed ?? 0),
        }));

        if (data.results.length === 0) {
          toast.success("Nessun documento in coda");
          break;
        }

        const pending = data.stats.inCoda;
        if (!autoContinue || (!force && pending === 0)) {
          toast.success(
            `Batch: ${data.summary.ok} ok, ${data.summary.review} review, ${data.summary.fail} fail, ${data.summary.chunksIndexed} chunk RAG`
          );
          break;
        }

        if (force) {
          toast.success(
            `Batch forzato: ${data.summary.processed} documenti elaborati`
          );
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore";
      toast.error(message);
    } finally {
      setRunning(false);
      stopRef.current = false;
      refreshStats().catch(() => undefined);
    }
  }

  function stopProcessing() {
    stopRef.current = true;
  }

  const pending = stats?.inCoda ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="h-6 w-6 text-sky-700" />
            Elaborazione AI documenti
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Coda automatica: OCR → estrazione campi → embedding RAG. I nuovi upload restano PENDING fino all&apos;analisi.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatsTick((k) => k + 1)}
          disabled={running || loadingStats}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loadingStats && "animate-spin")} />
          Aggiorna
        </Button>
      </div>

      {!stats?.openaiConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          OPENAI_API_KEY non configurata: OCR/struttura AI non disponibili.
        </div>
      )}
      {!stats?.r2Configured && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          R2 non configurato: serve path locale `DOCUMENTI_SOURCE_PATH` per leggere i file.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: "In coda", value: stats?.inCoda },
          { label: "Senza testo", value: stats?.senzaTesto },
          { label: "Da strutturare", value: stats?.daStrutturare },
          { label: "Da indicizzare RAG", value: stats?.daIndicizzareRag },
          { label: "Indicizzati RAG", value: stats?.indicizzatiRag },
          { label: "Strutturati", value: stats?.strutturati },
          { label: "Da revisionare", value: stats?.daRevisionare },
          { label: "Failed", value: stats?.failed },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {loadingStats && stats == null ? "—" : (item.value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="batchSize">Documenti per batch</Label>
              <Input
                id="batchSize"
                type="number"
                min={1}
                max={25}
                value={batchSize}
                disabled={running}
                onChange={(e) =>
                  setBatchSize(
                    Math.min(25, Math.max(1, Number(e.target.value) || 1))
                  )
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
              <input
                type="checkbox"
                checked={enableOcr}
                disabled={running}
                onChange={(e) => setEnableOcr(e.target.checked)}
              />
              OCR multimodale
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
              <input
                type="checkbox"
                checked={enableStructure}
                disabled={running}
                onChange={(e) => setEnableStructure(e.target.checked)}
              />
              Estrazione strutturata
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
              <input
                type="checkbox"
                checked={enableRag}
                disabled={running}
                onChange={(e) => setEnableRag(e.target.checked)}
              />
              Indicizzazione RAG
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
              <input
                type="checkbox"
                checked={autoContinue}
                disabled={running}
                onChange={(e) => setAutoContinue(e.target.checked)}
              />
              Continua automatico
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={force}
                disabled={running}
                onChange={(e) => setForce(e.target.checked)}
              />
              Forza riesecuzione
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <Button onClick={startProcessing} disabled={pending === 0 && !force}>
                <Play className="h-4 w-4 mr-2" />
                Avvia elaborazione
                {!force && pending > 0 ? ` (${pending} in coda)` : ""}
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopProcessing}>
                <Square className="h-4 w-4 mr-2" />
                Ferma
              </Button>
            )}
            {running && (
              <span className="inline-flex items-center gap-2 text-sm text-sky-800">
                <Loader2 className="h-4 w-4 animate-spin" />
                Elaborazione in corso…
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            <span>Sessione: {sessionTotals.processed} elaborati</span>
            <span className="text-emerald-700">OK {sessionTotals.ok}</span>
            <span className="text-amber-700">REVIEW {sessionTotals.review}</span>
            <span className="text-slate-600">SKIP {sessionTotals.skip}</span>
            <span className="text-red-700">FAIL {sessionTotals.fail}</span>
            <span className="text-sky-700">RAG chunks {sessionTotals.chunksIndexed}</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Log elaborazione</h2>
        <div className="border rounded-lg bg-white max-h-[28rem] overflow-y-auto divide-y">
          {logs.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Nessuna elaborazione ancora. Avvia un batch per vedere OK / FAIL / REVIEW.
            </p>
          ) : (
            logs.map((row, i) => {
              const style = STATUS_STYLE[row.status];
              const Icon = style.Icon;
              return (
                <div
                  key={`${row.id}-${row.at}-${i}`}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold w-fit",
                      style.className
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {style.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.titolo}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.categoria}
                      {row.dataScadenza ? ` · scad ${row.dataScadenza}` : ""}
                      {row.decision ? ` · ${row.decision}` : ""}
                      {row.textSource ? ` · text=${row.textSource}` : ""}
                      {row.rag ? ` · rag=${row.rag}` : ""}
                      {typeof row.chunksIndexed === "number" && row.chunksIndexed > 0
                        ? ` · chunks=${row.chunksIndexed}`
                        : ""}
                      {` · ${row.ms}ms`}
                    </p>
                    {row.error && (
                      <p className="text-xs text-red-600 mt-1">{row.error}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
