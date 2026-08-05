"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

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
  dipendente?: { id: string; nome: string; cognome: string } | null;
  automezzo?: { id: string; targa: string } | null;
}

interface ScadenzaRow {
  id: string;
  titolo: string;
  dataScadenza: string;
  giorniRimanenti: number;
  confermata: boolean;
  documento?: { id: string; titoloOriginale: string } | null;
  responsabile?: { name: string } | null;
}

type Tab = "da-classificare" | "prossime" | "con-scadenza" | "non-serve";

const tabs: { value: Tab; label: string }[] = [
  { value: "prossime", label: "Prossime" },
  { value: "da-classificare", label: "Da classificare" },
  { value: "con-scadenza", label: "Con scadenza" },
  { value: "non-serve", label: "Non serve" },
];

function formatoData(data: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(data));
}

function informazioniUrgenza(giorni: number) {
  if (giorni <= 1) {
    return {
      label: giorni === 0 ? "Scade oggi" : "Scade domani",
      badge: "border-red-200 bg-red-50 text-red-700",
      accent: "bg-red-500",
    };
  }
  if (giorni <= 7) {
    return {
      label: `${giorni} giorni`,
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      accent: "bg-orange-500",
    };
  }
  if (giorni <= 30) {
    return {
      label: `${giorni} giorni`,
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      accent: "bg-amber-400",
    };
  }
  return {
    label: `${giorni} giorni`,
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    accent: "bg-sky-500",
  };
}

function entityLabel(doc: DocumentoRow) {
  if (doc.dipendente) return `${doc.dipendente.cognome} ${doc.dipendente.nome}`;
  if (doc.automezzo) return doc.automezzo.targa;
  return null;
}

export default function ScadenzePage() {
  const [tab, setTab] = useState<Tab>("prossime");
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
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState({
    daClassificare: 0,
    conScadenza: 0,
    nonServe: 0,
    urgenti: 0,
  });

  // Reset quando cambia tab/ricerca: pattern React "adjust state during render"
  const tabSearchKey = `${tab}|${search}`;
  const [prevTabSearchKey, setPrevTabSearchKey] = useState(tabSearchKey);
  if (prevTabSearchKey !== tabSearchKey) {
    setPrevTabSearchKey(tabSearchKey);
    setPage(1);
    setDateDrafts({});
  }

  const [refreshKey, setRefreshKey] = useState(0);
  const loadKey = `${tab}|${page}|${search}|${refreshKey}`;
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey);
  if (prevLoadKey !== loadKey) {
    setPrevLoadKey(loadKey);
    setLoading(true);
    setErrore(false);
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/documenti?scadenza=da-classificare&limit=1").then((r) => r.json()),
      fetch("/api/documenti?scadenza=presenti&limit=1").then((r) => r.json()),
      fetch("/api/documenti?scadenza=non-serve&limit=1").then((r) => r.json()),
      fetch("/api/scadenze?giorni=7&confermate=false").then((r) => r.json()),
    ])
      .then(([a, b, c, d]) => {
        if (cancelled) return;
        setCounts({
          daClassificare: a.total ?? 0,
          conScadenza: b.total ?? 0,
          nonServe: c.total ?? 0,
          urgenti: (d.scadenze ?? []).length,
        });
      })
      .catch(() => {});

    const finish = () => {
      if (!cancelled) setLoading(false);
    };

    if (tab === "prossime") {
      fetch("/api/scadenze?giorni=90&confermate=false")
        .then((response) => {
          if (!response.ok) throw new Error("load");
          return response.json();
        })
        .then((data) => {
          if (cancelled) return;
          setScadenze(data.scadenze ?? []);
          setDocumenti([]);
          setTotal((data.scadenze ?? []).length);
          setTotalPages(1);
        })
        .catch(() => {
          if (!cancelled) setErrore(true);
        })
        .finally(finish);
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
      fetch(`/api/documenti?${params}`)
        .then((response) => {
          if (!response.ok) throw new Error("load");
          return response.json();
        })
        .then((data) => {
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
        })
        .catch(() => {
          if (!cancelled) setErrore(true);
        })
        .finally(finish);
    }

    return () => {
      cancelled = true;
    };
  }, [tab, page, search, refreshKey]);

  const ricarica = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function salvaScadenza(
    doc: DocumentoRow,
    dataScadenza: string,
    opts?: { fromSuggestion?: boolean },
  ) {
    if (!dataScadenza) {
      toast.error("Seleziona una data");
      return;
    }
    setSavingId(doc.id);
    try {
      const body: Record<string, unknown> = {
        dataScadenza,
        nonServeScadenza: false,
        scadenzaSource: opts?.fromSuggestion ? "FILENAME" : "MANUALE",
      };
      if (opts?.fromSuggestion) {
        body.scadenzaConfidence = doc.suggestedConfidence ?? 0.85;
        body.scadenzaRaw = doc.suggestedRaw;
      }
      const res = await fetch(`/api/documenti/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save");
      toast.success("Scadenza salvata");
      setDateDrafts((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      ricarica();
    } catch {
      toast.error("Salvataggio non riuscito");
    } finally {
      setSavingId(null);
    }
  }

  async function marcaNonServe(doc: DocumentoRow) {
    setSavingId(doc.id);
    try {
      const res = await fetch(`/api/documenti/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonServeScadenza: true, dataScadenza: null }),
      });
      if (!res.ok) throw new Error("save");
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
      const res = await fetch(`/api/documenti/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonServeScadenza: false,
          dataScadenza: null,
        }),
      });
      if (!res.ok) throw new Error("save");
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
      toast.success("Scadenza confermata");
    } catch {
      toast.error("Conferma non riuscita");
    } finally {
      setSavingId(null);
    }
  }

  const riepilogoProssime = useMemo(
    () => ({
      urgenti: scadenze.filter((s) => s.giorniRimanenti <= 7).length,
      inArrivo: scadenze.filter(
        (s) => s.giorniRimanenti > 7 && s.giorniRimanenti <= 30,
      ).length,
      confermate: scadenze.filter((s) => s.confermata).length,
    }),
    [scadenze],
  );

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
                Imposta la scadenza di ogni documento oppure indica che non serve.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/7 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-xs text-slate-400">Da classificare</p>
                <p className="text-sm font-medium text-white">
                  {counts.daClassificare} documenti
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setTab("prossime")}
            className="rounded-2xl border border-red-100 bg-white p-5 text-left shadow-sm shadow-slate-200/60 transition hover:border-red-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertCircle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {counts.urgenti}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Urgenti · entro 7 giorni
            </p>
          </button>
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {counts.daClassificare}
            </p>
            <p className="mt-1 text-sm text-slate-500">Da classificare</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <CalendarClock className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {counts.conScadenza}
            </p>
            <p className="mt-1 text-sm text-slate-500">Con scadenza</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CalendarCheck className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {counts.nonServe}
            </p>
            <p className="mt-1 text-sm text-slate-500">Non serve scadenza</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full flex-wrap rounded-xl bg-slate-100 p-1 sm:w-auto">
                {tabs.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTab(item.value)}
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
              {tab !== "prossime" && (
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
                    placeholder="Cerca documento…"
                    className="pl-9"
                  />
                </form>
              )}
            </div>
            <p className="text-sm text-slate-500">
              {tab === "prossime"
                ? `${scadenze.length} scadenze nei prossimi 90 giorni · ${riepilogoProssime.urgenti} urgenti`
                : `${total} documenti`}
            </p>
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
            scadenze.length === 0 ? (
              <EmptyState
                title="Nessuna scadenza imminente"
                description="Non ci sono scadenze nei prossimi 90 giorni."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {scadenze.map((scadenza) => {
                  const urgenza = informazioniUrgenza(scadenza.giorniRimanenti);
                  return (
                    <article
                      key={scadenza.id}
                      className="relative grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <span
                        aria-hidden
                        className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${urgenza.accent}`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-slate-950">
                            {scadenza.titolo}
                          </h3>
                          {scadenza.confermata && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              <Check className="h-3 w-3" />
                              Confermata
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                            {formatoData(scadenza.dataScadenza)}
                          </span>
                          {scadenza.documento?.titoloOriginale && (
                            <Link
                              href={`/documenti/${scadenza.documento.id}`}
                              className="inline-flex min-w-0 items-center gap-1.5 hover:text-slate-800"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="max-w-64 truncate">
                                {scadenza.documento.titoloOriginale}
                              </span>
                            </Link>
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
                            onClick={() => void confermaScadenza(scadenza.id)}
                            disabled={savingId === scadenza.id}
                            className="bg-slate-950 text-white hover:bg-slate-800"
                          >
                            {savingId === scadenza.id ? (
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
                })}
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
                  const busy = savingId === doc.id;
                  const hasSuggestion =
                    !!doc.suggestedScadenza && tab === "da-classificare";

                  return (
                    <article
                      key={doc.id}
                      className="grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/documenti/${doc.id}`}
                          className="font-semibold text-slate-950 hover:underline"
                        >
                          {doc.titoloOriginale}
                        </Link>
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
                              {formatoData(doc.dataScadenza)}
                            </span>
                          )}
                        </div>
                        {hasSuggestion && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-700">
                            <Sparkles className="h-3.5 w-3.5" />
                            Suggerita dal titolo:{" "}
                            <strong>{formatoData(doc.suggestedScadenza!)}</strong>
                            {doc.suggestedRaw ? ` (${doc.suggestedRaw})` : ""}
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
                              {busy ? (
                                <Loader2 className="animate-spin" data-icon="inline-start" />
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
                              Usa suggerimento
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
