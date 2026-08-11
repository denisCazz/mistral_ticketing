"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Snapshot = {
  documents: {
    total: number;
    pendingProfile: number;
    indexedV2: number;
    failed: number;
  };
  jobs: {
    PENDING: number;
    RUNNING: number;
    PAUSED: number;
    COMPLETED: number;
    FAILED: number;
  };
  totalTokens: number;
  recentJobs: Array<{
    id: string;
    documentoId: string;
    titolo: string;
    type: string;
    status: string;
    attempts: number;
    tokenCount: number;
    lastError: string | null;
    updatedAt: string;
  }>;
  profile: string;
  vectorMode: "pgvector" | "json";
  vectorReason: string | null;
  openaiConfigured: boolean;
  r2Configured: boolean;
};

type AdminAction =
  | "enqueue_pending"
  | "reindex_all"
  | "pause"
  | "resume"
  | "retry_failed"
  | "full_reprocess";

const STATUS_ICON = {
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  RUNNING: Loader2,
  PENDING: CirclePlay,
  PAUSED: CirclePause,
} as const;

export default function ProcessingPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<AdminAction | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/documenti-ai", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Errore caricamento coda AI");
    const data = (await response.json()) as Snapshot;
    setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const data = await load();
        if (cancelled) return;
        const active = data.jobs.PENDING + data.jobs.RUNNING > 0;
        timer = setTimeout(poll, active ? 3000 : 15_000);
      } catch {
        if (!cancelled) {
          toast.error("Errore caricamento coda AI");
          timer = setTimeout(poll, 15_000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  async function execute(action: AdminAction) {
    if (
      action === "full_reprocess" &&
      !window.confirm(
        "Rielaborare OCR, struttura ed embedding di tutti i documenti? L'operazione può generare costi API rilevanti."
      )
    ) {
      return;
    }

    setBusyAction(action);
    try {
      const response = await fetch("/api/admin/documenti-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "full_reprocess" ? { confirmed: true } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Azione non riuscita");
      }
      setSnapshot(data.snapshot as Snapshot);
      toast.success(`Documenti interessati: ${data.affected ?? 0}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore");
    } finally {
      setBusyAction(null);
    }
  }

  const cards = snapshot
    ? [
        ["Da reindicizzare", snapshot.documents.pendingProfile],
        ["Indicizzati v2", snapshot.documents.indexedV2],
        ["Job in attesa", snapshot.jobs.PENDING],
        ["Job attivi", snapshot.jobs.RUNNING],
        ["Completati", snapshot.jobs.COMPLETED],
        ["Falliti", snapshot.jobs.FAILED],
        ["In pausa", snapshot.jobs.PAUSED],
        ["Token embedding", snapshot.totalTokens.toLocaleString("it-IT")],
      ]
    : [];

  return (
    <div className="space-y-5">
      {snapshot && !snapshot.openaiConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Il processo server non vede `OPENAI_API_KEY`.
        </div>
      )}
      {snapshot && !snapshot.r2Configured && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          R2 non è disponibile: i file devono essere leggibili da
          `DOCUMENTI_SOURCE_PATH`.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={snapshot?.vectorMode === "pgvector" ? "default" : "secondary"}>
          {snapshot?.vectorMode ?? "—"}
        </Badge>
        <Badge variant="outline">{snapshot?.profile ?? "document-v2"}</Badge>
        {snapshot?.vectorMode === "json" && snapshot.vectorReason && (
          <span className="text-xs text-amber-700">{snapshot.vectorReason}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load().finally(() => setLoading(false));
          }}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Aggiorna
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(loading && !snapshot
          ? Array.from({ length: 8 }, (_, index) => [`loading-${index}`, "—"])
          : cards
        ).map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-5">
          <Button
            onClick={() => execute("enqueue_pending")}
            disabled={busyAction !== null}
          >
            <CirclePlay />
            Metti in coda mancanti
          </Button>
          <Button
            variant="outline"
            onClick={() => execute("reindex_all")}
            disabled={busyAction !== null}
          >
            <Sparkles />
            Reindicizza tutti in v2
          </Button>
          {snapshot?.jobs.PAUSED ? (
            <Button
              variant="outline"
              onClick={() => execute("resume")}
              disabled={busyAction !== null}
            >
              <CirclePlay />
              Riprendi
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => execute("pause")}
              disabled={busyAction !== null}
            >
              <CirclePause />
              Pausa dopo job corrente
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => execute("retry_failed")}
            disabled={busyAction !== null || snapshot?.jobs.FAILED === 0}
          >
            <RotateCcw />
            Riprova falliti
          </Button>
          <Button
            variant="destructive"
            onClick={() => execute("full_reprocess")}
            disabled={busyAction !== null}
          >
            <AlertTriangle />
            Rielaborazione completa
          </Button>
          {busyAction && <Loader2 className="m-2 animate-spin text-sky-700" />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">
            Job recenti
          </div>
          <div className="max-h-[30rem] divide-y overflow-y-auto">
            {snapshot?.recentJobs.length ? (
              snapshot.recentJobs.map((job) => {
                const Icon =
                  STATUS_ICON[job.status as keyof typeof STATUS_ICON] ??
                  AlertTriangle;
                return (
                  <div key={job.id} className="flex gap-3 px-4 py-3">
                    <Icon
                      className={
                        job.status === "RUNNING"
                          ? "mt-0.5 size-4 animate-spin text-sky-700"
                          : "mt-0.5 size-4 text-slate-500"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.titolo}</p>
                      <p className="text-xs text-slate-500">
                        {job.type} · {job.status} · tentativi {job.attempts} ·{" "}
                        {job.tokenCount.toLocaleString("it-IT")} token
                      </p>
                      {job.lastError && (
                        <p className="mt-1 text-xs text-red-600">
                          {job.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">
                Nessun job presente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
