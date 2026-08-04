"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

interface ScadenzaRow {
  id: string;
  titolo: string;
  dataScadenza: string;
  giorniRimanenti: number;
  confermata: boolean;
  documento?: { titoloOriginale: string } | null;
  responsabile?: { name: string } | null;
}

type Filtro = "tutte" | "da-confermare" | "confermate";

const filtri: { value: Filtro; label: string }[] = [
  { value: "tutte", label: "Tutte" },
  { value: "da-confermare", label: "Da confermare" },
  { value: "confermate", label: "Confermate" },
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
      dot: "bg-red-500 shadow-red-200",
      accent: "bg-red-500",
    };
  }

  if (giorni <= 7) {
    return {
      label: `${giorni} giorni`,
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      dot: "bg-orange-500 shadow-orange-200",
      accent: "bg-orange-500",
    };
  }

  if (giorni <= 30) {
    return {
      label: `${giorni} giorni`,
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-400 shadow-amber-200",
      accent: "bg-amber-400",
    };
  }

  return {
    label: `${giorni} giorni`,
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500 shadow-sky-200",
    accent: "bg-sky-500",
  };
}

export default function ScadenzePage() {
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [confermaInCorso, setConfermaInCorso] = useState<string | null>(null);

  const caricaScadenze = useCallback(async () => {
    setLoading(true);
    setErrore(false);

    try {
      const response = await fetch("/api/scadenze?giorni=90&confermate=false");
      if (!response.ok) throw new Error("Impossibile caricare le scadenze");
      const data = await response.json();
      setScadenze(data.scadenze ?? []);
    } catch {
      setErrore(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/scadenze?giorni=90&confermate=false")
      .then((response) => {
        if (!response.ok) throw new Error("Impossibile caricare le scadenze");
        return response.json();
      })
      .then((data) => setScadenze(data.scadenze ?? []))
      .catch(() => setErrore(true))
      .finally(() => setLoading(false));
  }, []);

  async function conferma(id: string) {
    setConfermaInCorso(id);

    try {
      const res = await fetch(`/api/scadenze/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confermata: true }),
      });
      if (!res.ok) throw new Error("Errore durante la conferma");

      setScadenze((correnti) =>
        correnti.map((scadenza) =>
          scadenza.id === id ? { ...scadenza, confermata: true } : scadenza,
        ),
      );
      toast.success("Scadenza confermata");
    } catch {
      toast.error("Non è stato possibile confermare la scadenza");
    } finally {
      setConfermaInCorso(null);
    }
  }

  const riepilogo = useMemo(
    () => ({
      urgenti: scadenze.filter((s) => s.giorniRimanenti <= 7).length,
      inArrivo: scadenze.filter(
        (s) => s.giorniRimanenti > 7 && s.giorniRimanenti <= 30,
      ).length,
      confermate: scadenze.filter((s) => s.confermata).length,
    }),
    [scadenze],
  );

  const scadenzeFiltrate = useMemo(() => {
    if (filtro === "da-confermare") return scadenze.filter((s) => !s.confermata);
    if (filtro === "confermate") return scadenze.filter((s) => s.confermata);
    return scadenze;
  }, [filtro, scadenze]);

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
                Tieni sotto controllo le prossime attività e conferma quelle già verificate.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/7 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-xs text-slate-400">Finestra di controllo</p>
                <p className="text-sm font-medium text-white">Prossimi 90 giorni</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-red-600">entro 7 giorni</span>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {loading ? "—" : riepilogo.urgenti}
            </p>
            <p className="mt-1 text-sm text-slate-500">Scadenze urgenti</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Clock3 className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-amber-600">entro 30 giorni</span>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {loading ? "—" : riepilogo.inArrivo}
            </p>
            <p className="mt-1 text-sm text-slate-500">In avvicinamento</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-emerald-600">verificate</span>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {loading ? "—" : riepilogo.confermate}
            </p>
            <p className="mt-1 text-sm text-slate-500">Scadenze confermate</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-950">Prossime scadenze</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {scadenzeFiltrate.length} {scadenzeFiltrate.length === 1 ? "attività" : "attività"}
              </p>
            </div>
            <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
              {filtri.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFiltro(item.value)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition sm:flex-none ${
                    filtro === item.value
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
              <p className="text-sm text-slate-500">Caricamento scadenze…</p>
            </div>
          ) : errore ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-950">Caricamento non riuscito</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Si è verificato un problema nel recupero delle scadenze.
              </p>
              <Button className="mt-5" variant="outline" onClick={caricaScadenze}>
                <RefreshCw data-icon="inline-start" />
                Riprova
              </Button>
            </div>
          ) : scadenzeFiltrate.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-950">Tutto sotto controllo</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Non ci sono scadenze in questa categoria nei prossimi 90 giorni.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {scadenzeFiltrate.map((scadenza) => {
                const urgenza = informazioniUrgenza(scadenza.giorniRimanenti);

                return (
                  <article
                    key={scadenza.id}
                    className="group relative grid gap-4 px-4 py-5 transition hover:bg-slate-50/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${urgenza.accent}`}
                    />
                    <div className="flex min-w-0 gap-4">
                      <div className="relative mt-0.5 hidden shrink-0 sm:block">
                        <span
                          className={`block h-3 w-3 rounded-full shadow-[0_0_0_5px] ${urgenza.dot}`}
                        />
                        <span className="absolute left-1/2 top-5 h-9 w-px -translate-x-1/2 bg-slate-200 group-last:hidden" />
                      </div>
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
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="max-w-64 truncate">
                                {scadenza.documento.titoloOriginale}
                              </span>
                            </span>
                          )}
                          {scadenza.responsabile?.name && (
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-slate-400" />
                              {scadenza.responsabile.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span
                        className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1.5 text-xs font-semibold ${urgenza.badge}`}
                      >
                        {urgenza.label}
                      </span>
                      {!scadenza.confermata ? (
                        <Button
                          size="sm"
                          onClick={() => conferma(scadenza.id)}
                          disabled={confermaInCorso === scadenza.id}
                          className="bg-slate-950 text-white hover:bg-slate-800"
                        >
                          {confermaInCorso === scadenza.id ? (
                            <Loader2 className="animate-spin" data-icon="inline-start" />
                          ) : (
                            <Check data-icon="inline-start" />
                          )}
                          Conferma
                        </Button>
                      ) : (
                        <ChevronRight className="hidden h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
