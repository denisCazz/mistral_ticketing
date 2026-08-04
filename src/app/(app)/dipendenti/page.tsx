"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isWeekend,
  startOfMonth,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  IdCard,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TIPI_PRESENZA,
  TIPO_PRESENZA_COLORS,
  TIPO_PRESENZA_LABELS,
  TIPO_PRESENZA_SHORT,
  costoGiorno,
  formatEuro,
  type TipoPresenza,
} from "@/lib/presenze";

type Dipendente = {
  id: string;
  nome: string;
  cognome: string;
  active: boolean;
  archiviato: boolean;
  email?: string | null;
  userId?: string | null;
  costoGiornata: number;
  indennitaTrasferta: number;
  costoMutua: number;
  costoPermesso: number;
  costoFerie: number;
  costoFestivo: number;
};

type Presenza = {
  id: string;
  dipendenteId: string;
  data: string;
  tipo: TipoPresenza;
  note: string | null;
};

function toMonthKey(date: Date) {
  return format(date, "yyyy-MM");
}

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function DipendentiPage() {
  const [mese, setMese] = useState(() => startOfMonth(new Date()));
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [presenze, setPresenze] = useState<Presenza[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const [cellOpen, setCellOpen] = useState(false);
  const [cellTarget, setCellTarget] = useState<{
    dipendente: Dipendente;
    data: string;
    tipo: TipoPresenza | null;
  } | null>(null);

  const [tariffeOpen, setTariffeOpen] = useState(false);
  const [editing, setEditing] = useState<Dipendente | null>(null);
  const [tariffeForm, setTariffeForm] = useState({
    costoGiornata: "0",
    indennitaTrasferta: "0",
    costoMutua: "0",
    costoPermesso: "0",
    costoFerie: "0",
    costoFestivo: "0",
  });

  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [nuovoForm, setNuovoForm] = useState({ nome: "", cognome: "" });
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(mese),
      end: endOfMonth(mese),
    });
  }, [mese]);

  const presenzaMap = useMemo(() => {
    const map = new Map<string, TipoPresenza>();
    for (const p of presenze) {
      map.set(`${p.dipendenteId}:${p.data}`, p.tipo);
    }
    return map;
  }, [presenze]);

  const fetchMese = useCallback(async (monthDate: Date) => {
    setLoading(true);
    const res = await fetch(`/api/presenze?mese=${toMonthKey(monthDate)}`);
    setLoading(false);
    if (!res.ok) {
      toast.error("Errore caricamento presenze");
      return;
    }
    const data = await res.json();
    setDipendenti(data.dipendenti);
    setPresenze(data.presenze);
  }, []);

  useEffect(() => {
    fetchMese(mese);
  }, [mese, fetchMese]);

  const stime = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dipendenti) {
      let totale = 0;
      for (const day of days) {
        const tipo = presenzaMap.get(`${d.id}:${dayKey(day)}`) ?? null;
        totale += costoGiorno(tipo, d);
      }
      map.set(d.id, totale);
    }
    return map;
  }, [dipendenti, days, presenzaMap]);

  const totaleMese = useMemo(() => {
    let sum = 0;
    for (const v of stime.values()) sum += v;
    return sum;
  }, [stime]);

  function getTipo(dipendenteId: string, data: string): TipoPresenza | null {
    return presenzaMap.get(`${dipendenteId}:${data}`) ?? null;
  }

  function openCell(dipendente: Dipendente, data: string) {
    setCellTarget({
      dipendente,
      data,
      tipo: getTipo(dipendente.id, data),
    });
    setCellOpen(true);
  }

  async function setPresenza(tipo: TipoPresenza | null) {
    if (!cellTarget) return;
    const key = `${cellTarget.dipendente.id}:${cellTarget.data}`;
    setSavingCell(key);
    const res = await fetch("/api/presenze", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dipendenteId: cellTarget.dipendente.id,
        data: cellTarget.data,
        tipo,
      }),
    });
    setSavingCell(null);
    if (!res.ok) {
      toast.error("Errore salvataggio presenza");
      return;
    }
    const data = await res.json();
    setPresenze((prev) => {
      const filtered = prev.filter(
        (p) =>
          !(
            p.dipendenteId === cellTarget.dipendente.id &&
            p.data === cellTarget.data
          )
      );
      if (!data.presenza) return filtered;
      return [...filtered, data.presenza];
    });
    setCellOpen(false);
    setCellTarget(null);
  }

  function openTariffe(d: Dipendente) {
    setEditing(d);
    setTariffeForm({
      costoGiornata: String(d.costoGiornata),
      indennitaTrasferta: String(d.indennitaTrasferta),
      costoMutua: String(d.costoMutua),
      costoPermesso: String(d.costoPermesso),
      costoFerie: String(d.costoFerie),
      costoFestivo: String(d.costoFestivo),
    });
    setTariffeOpen(true);
  }

  async function saveTariffe(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/dipendenti/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        costoGiornata: Number(tariffeForm.costoGiornata) || 0,
        indennitaTrasferta: Number(tariffeForm.indennitaTrasferta) || 0,
        costoMutua: Number(tariffeForm.costoMutua) || 0,
        costoPermesso: Number(tariffeForm.costoPermesso) || 0,
        costoFerie: Number(tariffeForm.costoFerie) || 0,
        costoFestivo: Number(tariffeForm.costoFestivo) || 0,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Errore salvataggio tariffe");
      return;
    }
    const data = await res.json();
    setDipendenti((prev) =>
      prev.map((d) => (d.id === editing.id ? { ...d, ...data.dipendente } : d))
    );
    toast.success("Tariffe aggiornate");
    setTariffeOpen(false);
    setEditing(null);
  }

  async function createDipendente(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/dipendenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovoForm),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Errore creazione dipendente");
      return;
    }
    const data = await res.json();
    if (data.credenziali) {
      toast.success(
        `Creato. Login: ${data.credenziali.utente} / ${data.credenziali.password}`
      );
    } else {
      toast.success("Dipendente creato");
    }
    setNuovoOpen(false);
    setNuovoForm({ nome: "", cognome: "" });
    fetchMese(mese);
  }

  const meseLabel = format(mese, "MMMM yyyy", { locale: it });

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <IdCard className="h-6 w-6" /> Dipendenti
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Feriali precompilati in sede · tariffe personalizzabili · utenza
            nome.cognome / Mistral1234
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMese((m) => startOfMonth(subMonths(m, 1)))}
              aria-label="Mese precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[9.5rem] text-center text-sm font-medium capitalize">
              {meseLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMese((m) => startOfMonth(addMonths(m, 1)))}
              aria-label="Mese successivo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setMese(startOfMonth(new Date()))}
          >
            Oggi
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            onClick={() => setNuovoOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Nuovo dipendente
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {TIPI_PRESENZA.map((tipo) => (
          <span
            key={tipo}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              TIPO_PRESENZA_COLORS[tipo]
            )}
          >
            <span className="font-bold">{TIPO_PRESENZA_SHORT[tipo]}</span>
            {TIPO_PRESENZA_LABELS[tipo]}
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
          </div>
        ) : dipendenti.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            Nessun dipendente. Creane uno per iniziare.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 min-w-[11rem] border-r border-gray-200">
                    Dipendente
                  </th>
                  {days.map((day) => {
                    const weekend = isWeekend(day);
                    const dow = getDay(day);
                    const labels = ["D", "L", "M", "M", "G", "V", "S"];
                    return (
                      <th
                        key={dayKey(day)}
                        className={cn(
                          "px-0.5 py-1.5 text-center font-medium min-w-[2rem]",
                          weekend ? "bg-gray-100 text-gray-400" : "text-gray-600"
                        )}
                      >
                        <div className="text-[10px] uppercase leading-none">
                          {labels[dow]}
                        </div>
                        <div className="text-xs mt-0.5">{format(day, "d")}</div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-20 bg-gray-50 px-3 py-2 text-right font-semibold text-gray-700 min-w-[7.5rem] border-l border-gray-200">
                    Stima
                  </th>
                </tr>
              </thead>
              <tbody>
                {dipendenti.map((d) => {
                  const stima = stime.get(d.id) ?? 0;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-gray-100 hover:bg-sky-50/40"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-gray-200">
                        <div className="flex items-center gap-1.5">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {d.cognome} {d.nome}
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">
                              {d.email
                                ? `${d.email.split("@")[0]} · `
                                : ""}
                              sede {formatEuro(d.costoGiornata)}
                              {d.indennitaTrasferta > 0
                                ? ` · +${formatEuro(d.indennitaTrasferta)} trasf.`
                                : ""}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-gray-400 hover:text-sky-700"
                            onClick={() => openTariffe(d)}
                            title="Modifica tariffe"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      {days.map((day) => {
                        const data = dayKey(day);
                        const tipo = getTipo(d.id, data);
                        const cellKey = `${d.id}:${data}`;
                        const weekend = isWeekend(day);
                        return (
                          <td key={data} className="p-0.5 text-center">
                            <button
                              type="button"
                              disabled={savingCell === cellKey}
                              onClick={() => openCell(d, data)}
                              title={
                                tipo
                                  ? `${TIPO_PRESENZA_LABELS[tipo]} — ${formatEuro(costoGiorno(tipo, d))}`
                                  : "Imposta presenza"
                              }
                              className={cn(
                                "mx-auto flex h-7 w-7 items-center justify-center rounded border text-[10px] font-bold transition-colors",
                                tipo
                                  ? TIPO_PRESENZA_COLORS[tipo]
                                  : weekend
                                    ? "border-transparent bg-gray-50 text-transparent hover:border-gray-300 hover:text-gray-400"
                                    : "border-transparent bg-transparent text-transparent hover:border-gray-300 hover:bg-gray-50 hover:text-gray-400"
                              )}
                            >
                              {tipo ? TIPO_PRESENZA_SHORT[tipo] : "·"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-white px-3 py-1.5 text-right font-semibold text-gray-900 border-l border-gray-200 tabular-nums">
                        {formatEuro(stima)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-sky-50 border-t border-sky-100">
                  <td
                    colSpan={days.length + 1}
                    className="sticky left-0 px-3 py-3 text-sm font-medium text-sky-900"
                  >
                    Totale stimato mese
                  </td>
                  <td className="sticky right-0 bg-sky-50 px-3 py-3 text-right text-base font-bold text-sky-900 border-l border-sky-100 tabular-nums">
                    {formatEuro(totaleMese)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cell picker */}
      <Dialog open={cellOpen} onOpenChange={setCellOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cellTarget
                ? `${cellTarget.dipendente.cognome} ${cellTarget.dipendente.nome}`
                : "Presenza"}
            </DialogTitle>
          </DialogHeader>
          {cellTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {format(new Date(`${cellTarget.data}T12:00:00`), "EEEE d MMMM yyyy", {
                  locale: it,
                })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TIPI_PRESENZA.map((tipo) => {
                  const costo = costoGiorno(tipo, cellTarget.dipendente);
                  const selected = cellTarget.tipo === tipo;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setPresenza(tipo)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left transition-all",
                        TIPO_PRESENZA_COLORS[tipo],
                        selected && "ring-2 ring-sky-600 ring-offset-1"
                      )}
                    >
                      <div className="text-sm font-semibold">
                        {TIPO_PRESENZA_LABELS[tipo]}
                      </div>
                      <div className="text-xs opacity-80 mt-0.5">
                        {formatEuro(costo)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPresenza(null)}
              >
                Rimuovi (giorno vuoto)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tariffe */}
      <Dialog open={tariffeOpen} onOpenChange={setTariffeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Tariffe — {editing?.cognome} {editing?.nome}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveTariffe} className="space-y-4">
            <p className="text-sm text-gray-500">
              Override rispetto ai costi standard. La trasferta somma la giornata
              base + indennità.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["costoGiornata", "Costo giornata (sede)"],
                  ["indennitaTrasferta", "Indennità trasferta"],
                  ["costoMutua", "Costo mutua"],
                  ["costoPermesso", "Costo permesso"],
                  ["costoFerie", "Costo ferie"],
                  ["costoFestivo", "Costo festivo"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    min="0"
                    step="0.01"
                    value={tariffeForm[key]}
                    onChange={(e) =>
                      setTariffeForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTariffeOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {saving ? "Salvataggio..." : "Salva"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nuovo dipendente */}
      <Dialog open={nuovoOpen} onOpenChange={setNuovoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo dipendente</DialogTitle>
          </DialogHeader>
          <form onSubmit={createDipendente} className="space-y-4">
            <p className="text-sm text-gray-500">
              Verrà creata l&apos;utenza{" "}
              <span className="font-medium text-gray-700">nome.cognome</span> con
              password <span className="font-medium text-gray-700">Mistral1234</span>
              , costi standard e feriali del mese in sede.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cognome">Cognome</Label>
              <Input
                id="cognome"
                required
                value={nuovoForm.cognome}
                onChange={(e) =>
                  setNuovoForm((f) => ({ ...f, cognome: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                required
                value={nuovoForm.nome}
                onChange={(e) =>
                  setNuovoForm((f) => ({ ...f, nome: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNuovoOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {saving ? "Salvataggio..." : "Crea"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
