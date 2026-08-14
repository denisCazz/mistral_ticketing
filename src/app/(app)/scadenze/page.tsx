"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Ban,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  UserRound,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";
import {
  type FiltroAgenda,
  formatoDataScadenza,
  groupScadenzeByHorizon,
  matchesFiltroAgenda,
  parseFiltroAgenda,
  urgenzaScadenza,
} from "@/lib/scadenza-agenda";
import { FONTE_SCADENZA_LABELS } from "@/lib/scadenza-suggest";
import type { FonteScadenza } from "@prisma/client";

interface DocumentoRow {
  id: string;
  titoloOriginale: string;
  categoria: string;
  sottocategoria: string | null;
  dataScadenza: string | null;
  nonServeScadenza: boolean;
  statoValidita: string;
  suggestedScadenza?: string | null;
  suggestedConfidence?: number;
  suggestedRaw?: string | null;
  suggestedSource?: string | null;
  suggestedEvidence?: string | null;
  suggestedNonServe?: boolean;
  hasAiExtraction?: boolean;
  canEnqueueAi?: boolean;
  dipendente?: { id: string; nome: string; cognome: string } | null;
  automezzo?: { id: string; targa: string } | null;
}

interface ScadenzaRow {
  id: string;
  titolo: string;
  dataScadenza: string;
  giorniRimanenti: number;
  confermata: boolean;
  fonte?: string | null;
  documento?: {
    id: string;
    titoloOriginale: string;
    categoria?: string | null;
  } | null;
  dipendente?: { id: string; nome: string; cognome: string } | null;
  automezzo?: { id: string; targa: string } | null;
  responsabile?: { name: string } | null;
}

type Tab = "da-classificare" | "prossime" | "con-scadenza" | "non-serve";

const tabs: { value: Tab; label: string }[] = [
  { value: "prossime", label: "Agenda" },
  { value: "da-classificare", label: "Da classificare" },
  { value: "con-scadenza", label: "Con scadenza" },
  { value: "non-serve", label: "Non serve" },
];

const FILTRI: { value: FiltroAgenda; label: string }[] = [
  { value: "tutte", label: "Tutte" },
  { value: "scadute", label: "Scadute" },
  { value: "urgenti", label: "7 giorni" },
  { value: "mese", label: "30 giorni" },
  { value: "da-confermare", label: "Da confermare" },
];

const TAB_VALUES: Tab[] = [
  "da-classificare",
  "prossime",
  "con-scadenza",
  "non-serve",
];

function parseTab(value: string | null): Tab {
  if (value && TAB_VALUES.includes(value as Tab)) return value as Tab;
  return "prossime";
}

function entityLabel(doc: {
  dipendente?: { nome: string; cognome: string } | null;
  automezzo?: { targa: string } | null;
}) {
  if (doc.dipendente) return `${doc.dipendente.cognome} ${doc.dipendente.nome}`;
  if (doc.automezzo) return doc.automezzo.targa;
  return null;
}

function fonteLabel(fonte: string | null | undefined) {
  if (!fonte) return "suggerimento";
  return FONTE_SCADENZA_LABELS[fonte as FonteScadenza] ?? fonte.toLowerCase();
}

export default function ScadenzePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-80 items-center justify-center p-8">
          <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
        </div>
      }
    >
      <ScadenzeContent />
    </Suspense>
  );
}

function ScadenzeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [filtro, setFiltro] = useState<FiltroAgenda>(() =>
    parseFiltroAgenda(searchParams.get("filtro")),
  );
  const [documenti, setDocumenti] = useState<DocumentoRow[]>([]);
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [awaitingAi, setAwaitingAi] = useState(false);
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState({
    daClassificare: 0,
    conScadenza: 0,
    nonServe: 0,
    scadute: 0,
    urgenti: 0,
    prossime: 0,
    daConfermare: 0,
  });

  const highlight = searchParams.get("highlight");
  const urlTab = parseTab(searchParams.get("tab"));
  const urlFiltro = parseFiltroAgenda(searchParams.get("filtro"));
  const [prevUrl, setPrevUrl] = useState(`${urlTab}|${urlFiltro}`);
  if (prevUrl !== `${urlTab}|${urlFiltro}`) {
    setPrevUrl(`${urlTab}|${urlFiltro}`);
    setTab(urlTab);
    setFiltro(urlFiltro);
  }

  function updateUrl(next: { tab?: Tab; filtro?: FiltroAgenda }) {
    const nextTab = next.tab ?? tab;
    const nextFiltro = next.filtro ?? filtro;
    setTab(nextTab);
    setFiltro(nextFiltro);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "prossime") params.delete("tab");
    else params.set("tab", nextTab);
    if (nextTab === "prossime" && nextFiltro !== "tutte") {
      params.set("filtro", nextFiltro);
    } else {
      params.delete("filtro");
    }
    const qs = params.toString();
    router.replace(qs ? `/scadenze?${qs}` : "/scadenze", { scroll: false });
  }

  const tabSearchKey = `${tab}|${search}`;
  const [prevTabSearchKey, setPrevTabSearchKey] = useState(tabSearchKey);
  if (prevTabSearchKey !== tabSearchKey) {
    setPrevTabSearchKey(tabSearchKey);
    setPage(1);
    setDateDrafts({});
  }

  const [refreshKey, setRefreshKey] = useState(0);
  const loadKey = `${tab}|${page}|${search}|${highlight ?? ""}|${refreshKey}`;
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey);
  if (prevLoadKey !== loadKey) {
    setPrevLoadKey(loadKey);
    setLoading(true);
    setErrore(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const countDocsP = Promise.all([
          fetch("/api/documenti?scadenza=da-classificare&limit=1").then((r) =>
            r.json(),
          ),
          fetch("/api/documenti?scadenza=presenti&limit=1").then((r) =>
            r.json(),
          ),
          fetch("/api/documenti?scadenza=non-serve&limit=1").then((r) =>
            r.json(),
          ),
        ]);

        if (tab === "prossime") {
          const params = new URLSearchParams({
            giorni: "90",
            passate: "90",
            confermate: "false",
          });
          if (search) params.set("search", search);
          if (highlight) params.set("includeId", highlight);
          const [data, [a, b, c]] = await Promise.all([
            fetch(`/api/scadenze?${params}`).then((response) => {
              if (!response.ok) throw new Error("load");
              return response.json();
            }),
            countDocsP,
          ]);
          if (cancelled) return;
          setScadenze(data.scadenze ?? []);
          setDocumenti([]);
          setTotal((data.scadenze ?? []).length);
          setTotalPages(1);
          setCounts({
            daClassificare: a.total ?? 0,
            conScadenza: b.total ?? 0,
            nonServe: c.total ?? 0,
            scadute: data.counts?.scadute ?? 0,
            urgenti: data.counts?.urgenti ?? 0,
            prossime: data.counts?.prossime ?? 0,
            daConfermare: data.counts?.daConfermare ?? 0,
          });
        } else {
          const scadenzaParam =
            tab === "da-classificare"
              ? "da-classificare"
              : tab === "con-scadenza"
                ? "presenti"
                : "non-serve";
          const params = new URLSearchParams({
            scadenza: scadenzaParam,
            page: String(page),
            limit: "40",
            suggest: "1",
          });
          if (search) params.set("search", search);
          const [data, agenda, [a, b, c]] = await Promise.all([
            fetch(`/api/documenti?${params}`).then((response) => {
              if (!response.ok) throw new Error("load");
              return response.json();
            }),
            fetch(
              "/api/scadenze?giorni=90&passate=90&confermate=false&countsOnly=1",
            ).then((r) => r.json()),
            countDocsP,
          ]);
          if (cancelled) return;
          const rows: DocumentoRow[] = data.documenti ?? [];
          setDocumenti(rows);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
          setScadenze([]);
          setDateDrafts((prev) => {
            const next = { ...prev };
            for (const doc of rows) {
              if (next[doc.id] === undefined) {
                next[doc.id] =
                  doc.dataScadenza?.slice(0, 10) ||
                  doc.suggestedScadenza ||
                  "";
              }
            }
            return next;
          });
          setCounts({
            daClassificare: a.total ?? 0,
            conScadenza: b.total ?? 0,
            nonServe: c.total ?? 0,
            scadute: agenda.counts?.scadute ?? 0,
            urgenti: agenda.counts?.urgenti ?? 0,
            prossime: agenda.counts?.prossime ?? 0,
            daConfermare: agenda.counts?.daConfermare ?? 0,
          });
        }
      } catch {
        if (!cancelled) setErrore(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, page, search, refreshKey, highlight]);

  const ricarica = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!highlight || loading) return;
    const el = document.getElementById(`scadenza-${highlight}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, loading, scadenze, filtro]);

  useEffect(() => {
    if (!awaitingAi || tab !== "da-classificare" || loading) return;
    if (documenti.every((d) => !d.canEnqueueAi)) setAwaitingAi(false);
  }, [awaitingAi, tab, loading, documenti]);

  useEffect(() => {
    if (!awaitingAi || tab !== "da-classificare") return;
    const interval = window.setInterval(() => ricarica(), 5000);
    const timeout = window.setTimeout(() => setAwaitingAi(false), 120_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [awaitingAi, tab, ricarica]);

  async function putDocumento(docId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/documenti/${docId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("save");
  }

  async function salvaScadenza(
    doc: DocumentoRow,
    dataScadenza: string,
    opts?: { fromSuggestion?: boolean; silent?: boolean },
  ) {
    if (!dataScadenza) {
      if (!opts?.silent) toast.error("Seleziona una data");
      return false;
    }
    setSavingId(doc.id);
    try {
      const body: Record<string, unknown> = {
        dataScadenza,
        nonServeScadenza: false,
        scadenzaSource: opts?.fromSuggestion
          ? (doc.suggestedSource ?? "FILENAME")
          : "MANUALE",
      };
      if (opts?.fromSuggestion) {
        body.scadenzaConfidence = doc.suggestedConfidence ?? 0.85;
        body.scadenzaRaw = doc.suggestedRaw;
      }
      await putDocumento(doc.id, body);
      if (!opts?.silent) toast.success("Scadenza salvata");
      setDateDrafts((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      if (!opts?.silent) ricarica();
      return true;
    } catch {
      if (!opts?.silent) toast.error("Salvataggio non riuscito");
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function accettaSuggerimenti() {
    const candidati = documenti.filter((d) => d.suggestedScadenza);
    if (candidati.length === 0) return;
    setBulkSaving(true);
    let ok = 0;
    try {
      for (const doc of candidati) {
        const saved = await salvaScadenza(doc, doc.suggestedScadenza!, {
          fromSuggestion: true,
          silent: true,
        });
        if (saved) ok++;
      }
      if (ok > 0) {
        toast.success(
          ok === 1 ? "Suggerimento applicato" : `${ok} scadenze salvate`,
        );
        ricarica();
      } else {
        toast.error("Nessun suggerimento salvato");
      }
    } finally {
      setBulkSaving(false);
    }
  }

  async function proponiConAi(ids: string[]) {
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await fetch("/api/documenti/scadenza-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.status === 403) {
        toast.error("Solo l'amministratore può avviare l'estrazione AI");
        return;
      }
      if (!res.ok) throw new Error("queue");
      const data = await res.json();
      const queued = data.queued ?? ids.length;
      toast.success(
        queued === 1
          ? "Documento in coda per l'AI"
          : `${queued} documenti in coda per l'AI`,
      );
      setAwaitingAi(true);
      ricarica();
    } catch {
      toast.error("Impossibile avviare l'estrazione AI");
    } finally {
      setBulkSaving(false);
    }
  }

  async function marcaNonServe(doc: DocumentoRow) {
    setSavingId(doc.id);
    try {
      await putDocumento(doc.id, {
        nonServeScadenza: true,
        dataScadenza: null,
      });
      toast.success("Segnato come non serve scadenza");
      setDateDrafts((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      ricarica();
    } catch {
      toast.error("Operazione non riuscita");
    } finally {
      setSavingId(null);
    }
  }

  async function ripristinaClassificazione(doc: DocumentoRow) {
    setSavingId(doc.id);
    try {
      await putDocumento(doc.id, {
        nonServeScadenza: false,
        dataScadenza: null,
      });
      toast.success("Documento da riclassificare");
      ricarica();
    } catch {
      toast.error("Operazione non riuscita");
    } finally {
      setSavingId(null);
    }
  }

  async function confermaScadenza(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/scadenze/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confermata: true }),
      });
      if (!res.ok) throw new Error("confirm");
      setScadenze((rows) =>
        rows.map((s) => (s.id === id ? { ...s, confermata: true } : s)),
      );
      setCounts((c) => ({
        ...c,
        daConfermare: Math.max(0, c.daConfermare - 1),
      }));
      toast.success("Scadenza confermata");
    } catch {
      toast.error("Conferma non riuscita");
    } finally {
      setSavingId(null);
    }
  }

  const visibili = useMemo(() => {
    const filtered = scadenze.filter((s) => matchesFiltroAgenda(s, filtro));
    if (highlight && !filtered.some((s) => s.id === highlight)) {
      const extra = scadenze.find((s) => s.id === highlight);
      if (extra) return [extra, ...filtered];
    }
    return filtered;
  }, [scadenze, filtro, highlight]);

  const gruppi = useMemo(
    () => groupScadenzeByHorizon(visibili),
    [visibili],
  );

  const chipCounts = useMemo(
    () => ({
      tutte: scadenze.length,
      scadute: scadenze.filter((s) => s.giorniRimanenti < 0).length,
      urgenti: scadenze.filter(
        (s) => s.giorniRimanenti >= 0 && s.giorniRimanenti <= 7,
      ).length,
      mese: scadenze.filter(
        (s) => s.giorniRimanenti >= 0 && s.giorniRimanenti <= 30,
      ).length,
      "da-confermare": scadenze.filter((s) => !s.confermata).length,
    }),
    [scadenze],
  );

  const suggeriti = documenti.filter((d) => d.suggestedScadenza).length;
  const daElaborareAi = documenti.filter((d) => d.canEnqueueAi).length;
  const heroAlert = counts.scadute > 0 ? counts.scadute : counts.daClassificare;
  const heroAlertLabel =
    counts.scadute > 0 ? "Già scadute" : "Da classificare";

  return (
    <div className="min-h-full bg-slate-50/70">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-200/70 sm:px-8 sm:py-9">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-blue-600/15 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <CalendarClock className="h-5 w-5 text-sky-300" />
              </div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
                Gestione scadenze
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Scadenziario
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Scadute, imminenti e documenti ancora da classificare, in un
                unico posto.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/7 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
              <AlertCircle
                className={
                  counts.scadute > 0 ? "h-5 w-5 text-red-300" : "h-5 w-5 text-amber-300"
                }
              />
              <div>
                <p className="text-xs text-slate-400">{heroAlertLabel}</p>
                <p className="text-sm font-medium text-white">
                  {heroAlert} documenti
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiButton
            active={tab === "prossime" && filtro === "scadute"}
            tone="red"
            icon={AlertCircle}
            value={counts.scadute}
            label="Già scadute"
            onClick={() => updateUrl({ tab: "prossime", filtro: "scadute" })}
          />
          <KpiButton
            active={tab === "prossime" && filtro === "urgenti"}
            tone="orange"
            icon={Clock3}
            value={counts.urgenti}
            label="Urgenti · entro 7 giorni"
            onClick={() => updateUrl({ tab: "prossime", filtro: "urgenti" })}
          />
          <KpiButton
            active={tab === "da-classificare"}
            tone="amber"
            icon={Sparkles}
            value={counts.daClassificare}
            label="Da classificare"
            onClick={() => updateUrl({ tab: "da-classificare", filtro: "tutte" })}
          />
          <KpiButton
            active={tab === "con-scadenza"}
            tone="sky"
            icon={CalendarCheck}
            value={counts.conScadenza}
            label="Con scadenza"
            onClick={() => updateUrl({ tab: "con-scadenza", filtro: "tutte" })}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full flex-wrap rounded-xl bg-slate-100 p-1 sm:w-auto">
                {tabs.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      updateUrl({
                        tab: item.value,
                        filtro: item.value === "prossime" ? filtro : "tutte",
                      })
                    }
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                      tab === item.value
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <form
                className="relative w-full sm:max-w-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(searchDraft.trim());
                }}
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={
                    tab === "prossime"
                      ? "Cerca titolo, persona, targa…"
                      : "Cerca documento…"
                  }
                  className="pl-9"
                />
              </form>
            </div>
            {tab === "prossime" && (
              <div className="flex flex-wrap gap-1.5">
                {FILTRI.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => updateUrl({ filtro: item.value })}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition",
                      filtro === item.value
                        ? "bg-slate-950 text-white ring-slate-950"
                        : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {item.label}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {chipCounts[item.value]}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {tab === "prossime"
                  ? `${visibili.length} in elenco · ${counts.scadute} scadute · ${counts.urgenti} urgenti`
                  : awaitingAi
                    ? "Estrazione AI in corso… l'elenco si aggiorna da solo"
                    : `${total} documenti`}
              </p>
              {tab === "da-classificare" && (
                <div className="flex flex-wrap gap-2">
                  {isAdmin && daElaborareAi > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkSaving || !!savingId}
                      onClick={() =>
                        void proponiConAi(
                          documenti.filter((d) => d.canEnqueueAi).map((d) => d.id),
                        )
                      }
                    >
                      {bulkSaving || awaitingAi ? (
                        <Loader2 className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <Sparkles data-icon="inline-start" />
                      )}
                      Proponi con AI ({daElaborareAi})
                    </Button>
                  )}
                  {suggeriti > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkSaving || !!savingId}
                      onClick={() => void accettaSuggerimenti()}
                    >
                      {bulkSaving ? (
                        <Loader2 className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <Check data-icon="inline-start" />
                      )}
                      Accetta {suggeriti} suggeriment{suggeriti === 1 ? "o" : "i"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
              <p className="text-sm text-slate-500">Caricamento…</p>
            </div>
          ) : errore ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-950">
                Caricamento non riuscito
              </h3>
              <Button className="mt-5" variant="outline" onClick={ricarica}>
                <RefreshCw data-icon="inline-start" />
                Riprova
              </Button>
            </div>
          ) : tab === "prossime" ? (
            visibili.length === 0 ? (
              <EmptyState
                title={
                  filtro === "scadute"
                    ? "Nessuna scadenza scaduta"
                    : search
                      ? "Nessun risultato"
                      : "Nessuna scadenza in agenda"
                }
                description={
                  search
                    ? "Prova con un altro termine di ricerca."
                    : "Non ci sono scadenze in questa finestra (90 giorni passati e futuri)."
                }
              />
            ) : (
              <div>
                {gruppi.map((group) => (
                  <section key={group.key}>
                    <header className="sticky top-0 z-10 flex items-center justify-between border-y border-slate-100 bg-slate-50/95 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur sm:px-6">
                      <span>{group.label}</span>
                      <span className="tabular-nums">{group.items.length}</span>
                    </header>
                    <div className="divide-y divide-slate-100">
                      {group.items.map((scadenza) => (
                        <ScadenzaArticle
                          key={scadenza.id}
                          scadenza={scadenza}
                          highlighted={highlight === scadenza.id}
                          busy={savingId === scadenza.id}
                          onConfirm={() => void confermaScadenza(scadenza.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : documenti.length === 0 ? (
            <EmptyState
              title="Nessun documento"
              description={
                tab === "da-classificare"
                  ? "Tutti i documenti hanno già una scadenza o sono segnati come non necessari."
                  : "Nessun documento in questa categoria."
              }
            />
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {documenti.map((doc) => {
                  const who = entityLabel(doc);
                  const draft = dateDrafts[doc.id] ?? "";
                  const busy = savingId === doc.id || bulkSaving;
                  const hasSuggestion =
                    !!doc.suggestedScadenza && tab === "da-classificare";
                  const giorni = doc.dataScadenza
                    ? giorniFinoScadenza(new Date(doc.dataScadenza))
                    : null;
                  const scaduta = giorni !== null && giorni < 0;

                  return (
                    <article
                      key={doc.id}
                      className="grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/documenti/${doc.id}`}
                            className="font-semibold text-slate-950 hover:underline"
                          >
                            {doc.titoloOriginale}
                          </Link>
                          {scaduta && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                              Scaduto
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            {doc.categoria}
                            {doc.sottocategoria ? ` / ${doc.sottocategoria}` : ""}
                          </span>
                          {who && (
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-slate-400" />
                              {who}
                            </span>
                          )}
                          {doc.dataScadenza && (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                              {formatoDataScadenza(doc.dataScadenza)}
                              {giorni !== null && giorni < 0
                                ? ` · ${urgenzaScadenza(giorni).label}`
                                : ""}
                            </span>
                          )}
                        </div>
                        {hasSuggestion && (
                          <p className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-700">
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            Proposta {fonteLabel(doc.suggestedSource)}:{" "}
                            <strong>
                              {formatoDataScadenza(doc.suggestedScadenza!)}
                            </strong>
                            {doc.suggestedEvidence
                              ? ` · “${doc.suggestedEvidence}”`
                              : doc.suggestedRaw
                                ? ` (${doc.suggestedRaw})`
                                : ""}
                          </p>
                        )}
                        {tab === "da-classificare" &&
                          doc.suggestedNonServe &&
                          !hasSuggestion && (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              <Sparkles className="h-3.5 w-3.5" />
                              L&apos;AI indica che non serve una scadenza
                            </p>
                          )}
                        {tab === "da-classificare" &&
                          !hasSuggestion &&
                          !doc.suggestedNonServe &&
                          doc.hasAiExtraction && (
                            <p className="mt-2 text-xs text-slate-400">
                              L&apos;AI non ha trovato una data di scadenza
                            </p>
                          )}
                      </div>

                      <div className="flex flex-col gap-2 sm:items-end">
                        {tab !== "non-serve" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="date"
                              value={draft}
                              onChange={(e) =>
                                setDateDrafts((prev) => ({
                                  ...prev,
                                  [doc.id]: e.target.value,
                                }))
                              }
                              className="w-auto"
                              disabled={busy}
                            />
                            <Button
                              size="sm"
                              disabled={busy || !draft}
                              onClick={() =>
                                void salvaScadenza(doc, draft, {
                                  fromSuggestion:
                                    draft === doc.suggestedScadenza,
                                })
                              }
                              className="bg-slate-950 text-white hover:bg-slate-800"
                            >
                              {busy && savingId === doc.id ? (
                                <Loader2
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <Check data-icon="inline-start" />
                              )}
                              Salva
                            </Button>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {tab === "da-classificare" && hasSuggestion && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void salvaScadenza(doc, doc.suggestedScadenza!, {
                                  fromSuggestion: true,
                                })
                              }
                            >
                              <Sparkles data-icon="inline-start" />
                              Usa proposta {fonteLabel(doc.suggestedSource)}
                            </Button>
                          )}
                          {tab === "da-classificare" &&
                            isAdmin &&
                            doc.canEnqueueAi &&
                            !hasSuggestion && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || awaitingAi}
                                onClick={() => void proponiConAi([doc.id])}
                              >
                                <Sparkles data-icon="inline-start" />
                                Proponi con AI
                              </Button>
                            )}
                          {tab === "da-classificare" &&
                            doc.suggestedNonServe &&
                            !hasSuggestion && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void marcaNonServe(doc)}
                              >
                                <Ban data-icon="inline-start" />
                                Conferma: non serve
                              </Button>
                            )}
                          {tab === "da-classificare" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void marcaNonServe(doc)}
                            >
                              <Ban data-icon="inline-start" />
                              Non serve scadenza
                            </Button>
                          )}
                          {tab === "con-scadenza" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void marcaNonServe(doc)}
                            >
                              <Ban data-icon="inline-start" />
                              Non serve
                            </Button>
                          )}
                          {tab === "non-serve" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void ripristinaClassificazione(doc)}
                            >
                              Riclassifica
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                  <p className="text-xs text-slate-500">
                    Pagina {page} di {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Precedente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Successiva
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ScadenzaArticle({
  scadenza,
  highlighted,
  busy,
  onConfirm,
}: {
  scadenza: ScadenzaRow;
  highlighted: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  const urgenza = urgenzaScadenza(scadenza.giorniRimanenti);
  const who = entityLabel(scadenza);
  return (
    <article
      id={`scadenza-${scadenza.id}`}
      className={cn(
        "relative grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6",
        highlighted && "bg-sky-50 ring-2 ring-inset ring-sky-400",
      )}
    >
      <span
        aria-hidden
        className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${urgenza.accent}`}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {scadenza.documento ? (
            <Link
              href={`/documenti/${scadenza.documento.id}`}
              className="truncate font-semibold text-slate-950 hover:underline"
            >
              {scadenza.titolo}
            </Link>
          ) : (
            <h3 className="truncate font-semibold text-slate-950">
              {scadenza.titolo}
            </h3>
          )}
          {scadenza.confermata ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Check className="h-3 w-3" />
              Confermata
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
              Da confermare
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
            {formatoDataScadenza(scadenza.dataScadenza)}
          </span>
          {who && (
            <span className="inline-flex items-center gap-1.5">
              {scadenza.automezzo ? (
                <Truck className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <UserRound className="h-3.5 w-3.5 text-slate-400" />
              )}
              {who}
            </span>
          )}
          {scadenza.documento?.categoria && (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              {scadenza.documento.categoria}
            </span>
          )}
          {scadenza.responsabile?.name && (
            <span>Resp. {scadenza.responsabile.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1.5 text-xs font-semibold ${urgenza.badge}`}
        >
          {urgenza.label}
        </span>
        {!scadenza.confermata && (
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className="bg-slate-950 text-white hover:bg-slate-800"
          >
            {busy ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            Conferma
          </Button>
        )}
      </div>
    </article>
  );
}

function KpiButton({
  active,
  tone,
  icon: Icon,
  value,
  label,
  onClick,
}: {
  active: boolean;
  tone: "red" | "orange" | "amber" | "sky";
  icon: typeof AlertCircle;
  value: number;
  label: string;
  onClick: () => void;
}) {
  const tones = {
    red: {
      card: "border-red-100 hover:border-red-200",
      icon: "bg-red-50 text-red-600",
      value: value > 0 ? "text-red-700" : "text-slate-950",
    },
    orange: {
      card: "border-orange-100 hover:border-orange-200",
      icon: "bg-orange-50 text-orange-600",
      value: value > 0 ? "text-orange-700" : "text-slate-950",
    },
    amber: {
      card: "border-amber-100 hover:border-amber-200",
      icon: "bg-amber-50 text-amber-600",
      value: value > 0 ? "text-amber-700" : "text-slate-950",
    },
    sky: {
      card: "border-sky-100 hover:border-sky-200",
      icon: "bg-sky-50 text-sky-600",
      value: "text-slate-950",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-white p-5 text-left shadow-sm shadow-slate-200/60 transition hover:shadow-md",
        tones.card,
        active && "ring-2 ring-slate-900/10",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tones.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p
        className={cn(
          "mt-4 text-3xl font-semibold tracking-tight",
          tones.value,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}
