"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function CostiPage() {
  const [form, setForm] = useState<TariffeDipendente>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="p-6 space-y-6 max-w-2xl">
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
    </div>
  );
}
