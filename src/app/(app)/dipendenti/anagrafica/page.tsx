"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, IdCard, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEuro, type TariffeDipendente } from "@/lib/presenze";

type Categoria = TariffeDipendente & {
  id: string;
  nome: string;
};

type Dipendente = TariffeDipendente & {
  id: string;
  nome: string;
  cognome: string;
  active: boolean;
  archiviato: boolean;
  email: string | null;
  categoriaId: string;
  categoria: { id: string; nome: string };
  tariffePersonalizzate: Record<keyof TariffeDipendente, number | null>;
};

const TARIFFE: { key: keyof TariffeDipendente; label: string }[] = [
  { key: "costoGiornata", label: "Costo giornata (sede)" },
  { key: "indennitaTrasferta", label: "Indennità trasferta" },
  { key: "costoMutua", label: "Costo mutua" },
  { key: "costoPermesso", label: "Costo permesso" },
  { key: "costoFerie", label: "Costo ferie" },
  { key: "costoFestivo", label: "Costo festivo" },
];

type FormState = {
  nome: string;
  cognome: string;
  categoriaId: string;
  active: boolean;
  tariffe: Record<keyof TariffeDipendente, string>;
};

function emptyTariffe(): FormState["tariffe"] {
  return {
    costoGiornata: "",
    indennitaTrasferta: "",
    costoMutua: "",
    costoPermesso: "",
    costoFerie: "",
    costoFestivo: "",
  };
}

function emptyForm(categoriaId = "manutentore"): FormState {
  return {
    nome: "",
    cognome: "",
    categoriaId,
    active: true,
    tariffe: emptyTariffe(),
  };
}

export default function AnagraficaDipendentiPage() {
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dipendente | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [dipendentiRes, categorieRes] = await Promise.all([
      fetch("/api/dipendenti?archiviati=1"),
      fetch("/api/costi"),
    ]);
    setLoading(false);
    if (!dipendentiRes.ok || !categorieRes.ok) {
      toast.error("Errore caricamento anagrafica dipendenti");
      return;
    }
    const [dipendentiData, categorieData] = await Promise.all([
      dipendentiRes.json(),
      categorieRes.json(),
    ]);
    setDipendenti(dipendentiData.dipendenti);
    setCategorie(categorieData.categorie);
  }, []);

  useEffect(() => {
    // Il caricamento iniziale sincronizza la pagina con le API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(categorie[0]?.id));
    setDialogOpen(true);
  }

  function openEdit(dipendente: Dipendente) {
    setEditing(dipendente);
    setForm({
      nome: dipendente.nome,
      cognome: dipendente.cognome,
      categoriaId: dipendente.categoriaId,
      active: dipendente.active,
      tariffe: Object.fromEntries(
        TARIFFE.map(({ key }) => [
          key,
          dipendente.tariffePersonalizzate[key] == null
            ? ""
            : String(dipendente.tariffePersonalizzate[key]),
        ])
      ) as FormState["tariffe"],
    });
    setDialogOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const tariffe = Object.fromEntries(
      TARIFFE.map(({ key }) => [
        key,
        form.tariffe[key] === "" ? null : Number(form.tariffe[key]),
      ])
    );
    const payload = {
      nome: form.nome,
      cognome: form.cognome,
      categoriaId: form.categoriaId,
      active: form.active,
      ...tariffe,
    };

    let res: Response;
    if (editing) {
      res = await fetch(`/api/dipendenti/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch("/api/dipendenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        const hasOverride = Object.values(tariffe).some((value) => value !== null);
        if (hasOverride) {
          res = await fetch(`/api/dipendenti/${created.dipendente.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tariffe),
          });
        }
      }
    }
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Errore salvataggio dipendente");
      return;
    }
    setDialogOpen(false);
    await load();
    toast.success(editing ? "Dipendente aggiornato" : "Dipendente creato");
  }

  async function toggleArchivio(dipendente: Dipendente) {
    const archiviato = !dipendente.archiviato;
    const res = await fetch(`/api/dipendenti/${dipendente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiviato }),
    });
    if (!res.ok) {
      toast.error("Errore aggiornamento dipendente");
      return;
    }
    await load();
    toast.success(archiviato ? "Dipendente archiviato" : "Dipendente ripristinato");
  }

  const categoriaSelezionata = categorie.find(
    (categoria) => categoria.id === form.categoriaId
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <IdCard className="h-6 w-6" />
            Dipendenti
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Anagrafica, categoria e tariffe personalizzate dei dipendenti.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600"
          disabled={categorie.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuovo dipendente
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
          </div>
        ) : dipendenti.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            Nessun dipendente presente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Dipendente</th>
                  <th className="px-4 py-3 text-left font-semibold">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold">Tariffa sede</th>
                  <th className="px-4 py-3 text-left font-semibold">Stato</th>
                  <th className="px-4 py-3 text-right font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {dipendenti.map((dipendente) => (
                  <tr
                    key={dipendente.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {dipendente.cognome} {dipendente.nome}
                      </div>
                      <div className="text-xs text-gray-500">{dipendente.email}</div>
                    </td>
                    <td className="px-4 py-3">{dipendente.categoria.nome}</td>
                    <td className="px-4 py-3">
                      {formatEuro(dipendente.costoGiornata)}
                      {Object.values(dipendente.tariffePersonalizzate).some(
                        (value) => value !== null
                      ) && (
                        <span className="ml-2 rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-700">
                          personalizzata
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          dipendente.archiviato
                            ? "text-gray-400"
                            : dipendente.active
                              ? "text-emerald-700"
                              : "text-amber-700"
                        }
                      >
                        {dipendente.archiviato
                          ? "Archiviato"
                          : dipendente.active
                            ? "Attivo"
                            : "Disattivato"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(dipendente)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Modifica
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleArchivio(dipendente)}
                        >
                          {dipendente.archiviato ? (
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {dipendente.archiviato ? "Ripristina" : "Archivia"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifica dipendente" : "Nuovo dipendente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cognome">Cognome</Label>
                <Input
                  id="cognome"
                  value={form.cognome}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cognome: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.categoriaId}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, categoriaId: value ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categorie.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                Dipendente attivo
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Tariffe personalizzate
                </h3>
                <p className="text-xs text-gray-500">
                  Lascia vuoto per usare la maschera “
                  {categoriaSelezionata?.nome ?? "categoria"}”.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARIFFE.map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`tariffa-${key}`}>{label}</Label>
                    <Input
                      id={`tariffa-${key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={
                        categoriaSelezionata
                          ? formatEuro(categoriaSelezionata[key])
                          : "Default categoria"
                      }
                      value={form.tariffe[key]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tariffe: { ...f.tariffe, [key]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
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
    </div>
  );
}
