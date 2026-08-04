"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CATEGORIE_COSTO_ACCESSORIO,
  CATEGORIA_COSTO_ACCESSORIO_LABELS,
  type CategoriaCostoAccessorio,
} from "@/lib/costi-accessori";
import { formatEuro, type TariffeDipendente } from "@/lib/presenze";

const FIELDS: { key: keyof TariffeDipendente; label: string; hint: string }[] = [
  {
    key: "costoGiornata",
    label: "Costo giornata (sede)",
    hint: "Base giornaliera per lavoro in sede",
  },
  {
    key: "indennitaTrasferta",
    label: "Indennità trasferta",
    hint: "Aggiunta alla giornata quando è trasferta",
  },
  {
    key: "costoMutua",
    label: "Costo mutua",
    hint: "Costo giornaliero in mutua",
  },
  {
    key: "costoPermesso",
    label: "Costo permesso",
    hint: "Costo giornaliero in permesso",
  },
  {
    key: "costoFerie",
    label: "Costo ferie",
    hint: "Costo giornaliero in ferie",
  },
  {
    key: "costoFestivo",
    label: "Costo festivo",
    hint: "Costo giornaliero festivo",
  },
];

const EMPTY: TariffeDipendente = {
  costoGiornata: 0,
  indennitaTrasferta: 0,
  costoMutua: 0,
  costoPermesso: 0,
  costoFerie: 0,
  costoFestivo: 0,
};

type Dipendente = {
  id: string;
  nome: string;
  cognome: string;
};

type CostoAccessorio = {
  id: string;
  dipendenteId: string;
  data: string;
  categoria: CategoriaCostoAccessorio;
  importo: number;
  note: string | null;
  dipendente: Dipendente;
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const EMPTY_ACCESSORIO = {
  dipendenteId: "",
  data: localDateKey(),
  categoria: "VITTO" as CategoriaCostoAccessorio,
  importo: "",
  note: "",
};

export default function CostiPage() {
  const [form, setForm] = useState<TariffeDipendente>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mese, setMese] = useState(() => localDateKey().slice(0, 7));
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [costiAccessori, setCostiAccessori] = useState<CostoAccessorio[]>([]);
  const [loadingAccessori, setLoadingAccessori] = useState(true);
  const [savingAccessorio, setSavingAccessorio] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [accessorioForm, setAccessorioForm] = useState(EMPTY_ACCESSORIO);

  useEffect(() => {
    fetch("/api/costi")
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        setForm(data.costi);
      })
      .catch(() => toast.error("Errore caricamento costi"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/dipendenti").then(async (res) => {
        if (!res.ok) throw new Error("dipendenti");
        return res.json();
      }),
      fetch(`/api/costi-accessori?mese=${mese}`).then(async (res) => {
        if (!res.ok) throw new Error("costi");
        return res.json();
      }),
    ])
      .then(([dipendentiData, costiData]) => {
        if (!active) return;
        setDipendenti(dipendentiData.dipendenti);
        setCostiAccessori(costiData.costi);
        setAccessorioForm((current) => ({
          ...current,
          dipendenteId:
            current.dipendenteId || dipendentiData.dipendenti[0]?.id || "",
        }));
      })
      .catch(() => {
        if (active) toast.error("Errore caricamento costi accessori");
      })
      .finally(() => {
        if (active) setLoadingAccessori(false);
      });
    return () => {
      active = false;
    };
  }, [mese]);

  const totaleAccessori = useMemo(
    () => costiAccessori.reduce((sum, costo) => sum + costo.importo, 0),
    [costiAccessori]
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/costi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Errore salvataggio costi");
      return;
    }
    const data = await res.json();
    setForm(data.costi);
    toast.success("Costi standard salvati");
  }

  async function saveAccessorio(e: React.FormEvent) {
    e.preventDefault();
    setSavingAccessorio(true);
    const res = await fetch("/api/costi-accessori", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...accessorioForm,
        importo: Number(accessorioForm.importo),
      }),
    });
    setSavingAccessorio(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Errore salvataggio costo accessorio");
      return;
    }

    const data = await res.json();
    if (data.costo.data.slice(0, 7) === mese) {
      setCostiAccessori((current) => [data.costo, ...current]);
    } else {
      setLoadingAccessori(true);
      setMese(data.costo.data.slice(0, 7));
    }
    setAccessorioForm((current) => ({
      ...EMPTY_ACCESSORIO,
      dipendenteId: current.dipendenteId,
      data: current.data,
    }));
    toast.success("Costo accessorio aggiunto");
  }

  async function deleteAccessorio(id: string) {
    if (!window.confirm("Eliminare questo costo accessorio?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/costi-accessori/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      toast.error("Errore eliminazione costo accessorio");
      return;
    }
    setCostiAccessori((current) => current.filter((costo) => costo.id !== id));
    toast.success("Costo accessorio eliminato");
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Coins className="h-6 w-6" /> Costi standard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Valori di default applicati ai nuovi dipendenti. Puoi personalizzarli
          per ciascuno dalla pagina Dipendenti.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
        </div>
      ) : (
        <form
          onSubmit={save}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [key]: Number(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-gray-400">{hint}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-900">
            Anteprima trasferta:{" "}
            <span className="font-semibold">
              {formatEuro(form.costoGiornata + form.indennitaTrasferta)}
            </span>{" "}
            (giornata + indennità)
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {saving ? "Salvataggio..." : "Salva costi"}
            </Button>
          </div>
        </form>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Costi accessori</h2>
            <p className="text-sm text-gray-500 mt-1">
              Spese occasionali associate a un dipendente, separate dalle tariffe
              giornaliere.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mese-accessori">Mese visualizzato</Label>
            <Input
              id="mese-accessori"
              type="month"
              value={mese}
              onChange={(e) => {
                setLoadingAccessori(true);
                setMese(e.target.value);
              }}
              className="w-44"
            />
          </div>
        </div>

        <form
          onSubmit={saveAccessorio}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Dipendente</Label>
              <Select
                value={accessorioForm.dipendenteId || null}
                onValueChange={(value) =>
                  setAccessorioForm((current) => ({
                    ...current,
                    dipendenteId: value ?? "",
                  }))
                }
                items={Object.fromEntries(
                  dipendenti.map((d) => [
                    d.id,
                    `${d.cognome} ${d.nome}`.trim(),
                  ])
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona dipendente" />
                </SelectTrigger>
                <SelectContent>
                  {dipendenti.map((dipendente) => (
                    <SelectItem key={dipendente.id} value={dipendente.id}>
                      {dipendente.cognome} {dipendente.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data-accessorio">Data</Label>
              <Input
                id="data-accessorio"
                type="date"
                required
                value={accessorioForm.data}
                onChange={(e) =>
                  setAccessorioForm((current) => ({
                    ...current,
                    data: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={accessorioForm.categoria}
                onValueChange={(value) =>
                  setAccessorioForm((current) => ({
                    ...current,
                    categoria: value as CategoriaCostoAccessorio,
                  }))
                }
                items={CATEGORIA_COSTO_ACCESSORIO_LABELS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIE_COSTO_ACCESSORIO.map((categoria) => (
                    <SelectItem key={categoria} value={categoria}>
                      {CATEGORIA_COSTO_ACCESSORIO_LABELS[categoria]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="importo-accessorio">Importo</Label>
              <Input
                id="importo-accessorio"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0,00"
                value={accessorioForm.importo}
                onChange={(e) =>
                  setAccessorioForm((current) => ({
                    ...current,
                    importo: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-accessorio">Note (facoltative)</Label>
            <Textarea
              id="note-accessorio"
              maxLength={500}
              rows={2}
              placeholder="Dettagli o riferimento della spesa"
              value={accessorioForm.note}
              onChange={(e) =>
                setAccessorioForm((current) => ({
                  ...current,
                  note: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={savingAccessorio || !accessorioForm.dipendenteId}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              {savingAccessorio ? "Aggiunta..." : "Aggiungi costo"}
            </Button>
          </div>
        </form>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <span className="font-medium text-gray-700">
              {costiAccessori.length}{" "}
              {costiAccessori.length === 1 ? "voce" : "voci"}
            </span>
            <span className="font-semibold text-gray-900">
              Totale: {formatEuro(totaleAccessori)}
            </span>
          </div>
          {loadingAccessori ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
            </div>
          ) : costiAccessori.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              Nessun costo accessorio registrato nel mese selezionato.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Dipendente</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Azioni</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costiAccessori.map((costo) => (
                  <TableRow key={costo.id}>
                    <TableCell>
                      {costo.data.split("-").reverse().join("/")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {costo.dipendente.cognome} {costo.dipendente.nome}
                    </TableCell>
                    <TableCell>
                      {CATEGORIA_COSTO_ACCESSORIO_LABELS[costo.categoria]}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-gray-500">
                      {costo.note || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEuro(costo.importo)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === costo.id}
                        onClick={() => deleteAccessorio(costo.id)}
                        aria-label="Elimina costo"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
