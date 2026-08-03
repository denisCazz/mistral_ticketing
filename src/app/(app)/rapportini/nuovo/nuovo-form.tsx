"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SignaturePad from "@/components/SignaturePad";
import {
  getControlloFields,
  SETTORE_VALUES,
  SETTORE_LABELS,
  SI_NO_NC_VALUES,
  TIPO_IMPIANTO_BY_SETTORE,
  TIPO_IMPIANTO_LABELS,
  TIPOLOGIA_INTERVENTO_VALUES,
  TIPOLOGIA_INTERVENTO_LABELS,
  UBICAZIONE_BY_SETTORE,
  UBICAZIONE_LABELS,
  type ControlloKey,
  type Settore,
  type SiNoNc,
} from "@/lib/rapportino-constants";
import { cn } from "@/lib/utils";

interface ClienteOption {
  id: string;
  ragioneSociale: string;
  citta?: string | null;
}

interface MarcaOption {
  id: string;
  nome: string;
  modelli: { id: string; nome: string; marcaId: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  clienteId: string;
  praticaId: string;
  dataIntervento: string;
  oraIntervento: string;
  tipologiaIntervento: string;
  settore: Settore;
  tipoImpianto: string;
  marca: string;
  modello: string;
  numeroSerie: string;
  tipoIntervento: string;
  motivoChiamata: string;
  descrizione: string;
  spiegataManutenzione: SiNoNc | "";
  accessibilita: SiNoNc | "";
  integritaComponente: SiNoNc | "";
  conformitaNormativa: SiNoNc | "";
  esitoFunzionamento: SiNoNc | "";
  presaVisioneCondizioniGaranzia: boolean;
  ubicazione: string;
  materialiUtilizzati: string;
  note: string;
  firmaOperatore: string;
  firmaCliente: string;
  firmaClientePrivacy: string;
};

export default function NuovoRapportinoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const praticaId = searchParams.get("praticaId");

  const [clienti, setClienti] = useState<ClienteOption[]>([]);
  const [marche, setMarche] = useState<MarcaOption[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormState>({
    clienteId: "",
    praticaId: praticaId || "",
    dataIntervento: today(),
    oraIntervento: "",
    tipologiaIntervento: "manutenzione_periodica",
    settore: "antincendio",
    tipoImpianto: "estintore",
    marca: "",
    modello: "",
    numeroSerie: "",
    tipoIntervento: "Manutenzione",
    motivoChiamata: "",
    descrizione: "",
    spiegataManutenzione: "",
    accessibilita: "",
    integritaComponente: "",
    conformitaNormativa: "",
    esitoFunzionamento: "",
    presaVisioneCondizioniGaranzia: false,
    ubicazione: "",
    materialiUtilizzati: "",
    note: "",
    firmaOperatore: "",
    firmaCliente: "",
    firmaClientePrivacy: "",
  });

  useEffect(() => {
    fetch("/api/clienti?limit=200")
      .then((r) => r.json())
      .then((json) => setClienti(Array.isArray(json) ? json : json.clienti || []))
      .catch(() => setClienti([]));
    fetch("/api/marche")
      .then((r) => r.json())
      .then((json) => setMarche(Array.isArray(json) ? json : []))
      .catch(() => setMarche([]));
  }, []);

  const filteredClienti = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    if (!q) return clienti.slice(0, 30);
    return clienti
      .filter((c) => c.ragioneSociale.toLowerCase().includes(q))
      .slice(0, 30);
  }, [clienti, clienteSearch]);

  const modelli = useMemo(() => {
    const marca = marche.find((m) => m.nome === form.marca);
    return marca?.modelli || [];
  }, [marche, form.marca]);

  const tipiImpianto = TIPO_IMPIANTO_BY_SETTORE[form.settore];
  const ubicazioni = UBICAZIONE_BY_SETTORE[form.settore];
  const controlli = getControlloFields(form.settore);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSettoreChange(settore: Settore) {
    setForm((prev) => ({
      ...prev,
      settore,
      tipoImpianto: TIPO_IMPIANTO_BY_SETTORE[settore][0],
      ubicazione: "",
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clienteId) {
      toast.error("Seleziona un cliente");
      return;
    }
    if (!form.marca || !form.modello || !form.descrizione.trim()) {
      toast.error("Compila marca, modello e descrizione");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rapportini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          praticaId: form.praticaId || null,
          spiegataManutenzione: form.spiegataManutenzione || null,
          accessibilita: form.accessibilita || null,
          integritaComponente: form.integritaComponente || null,
          conformitaNormativa: form.conformitaNormativa || null,
          esitoFunzionamento: form.esitoFunzionamento || null,
          ubicazione: form.ubicazione || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Errore salvataggio");
        return;
      }
      toast.success("Rapportino creato");
      router.push(`/rapportini/${json.id}`);
    } catch {
      toast.error("Errore di rete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuovo rapportino</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scheda intervento antincendio / elettrico
          </p>
        </div>
        <Link href="/rapportini" className={cn(buttonVariants({ variant: "outline" }))}>
          Annulla
        </Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente e data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cerca cliente</Label>
              <Input
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                placeholder="Ragione sociale…"
              />
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={form.clienteId}
                onChange={(e) => setField("clienteId", e.target.value)}
                required
              >
                <option value="">Seleziona cliente…</option>
                {filteredClienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ragioneSociale}
                    {c.citta ? ` — ${c.citta}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data intervento</Label>
                <Input
                  type="date"
                  value={form.dataIntervento}
                  onChange={(e) => setField("dataIntervento", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ora</Label>
                <Input
                  type="time"
                  value={form.oraIntervento}
                  onChange={(e) => setField("oraIntervento", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Impianto e intervento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Settore</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={form.settore}
                  onChange={(e) => onSettoreChange(e.target.value as Settore)}
                >
                  {SETTORE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {SETTORE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Tipo impianto / apparecchio</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={form.tipoImpianto}
                  onChange={(e) => setField("tipoImpianto", e.target.value)}
                >
                  {tipiImpianto.map((v) => (
                    <option key={v} value={v}>
                      {TIPO_IMPIANTO_LABELS[v] || v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Tipologia</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={form.tipologiaIntervento}
                  onChange={(e) => setField("tipologiaIntervento", e.target.value)}
                >
                  {TIPOLOGIA_INTERVENTO_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {TIPOLOGIA_INTERVENTO_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Tipo intervento</Label>
                <Input
                  value={form.tipoIntervento}
                  onChange={(e) => setField("tipoIntervento", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Marca</Label>
                <Input
                  list="marche-list"
                  value={form.marca}
                  onChange={(e) => {
                    setField("marca", e.target.value);
                    setField("modello", "");
                  }}
                  required
                />
                <datalist id="marche-list">
                  {marche.map((m) => (
                    <option key={m.id} value={m.nome} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Modello</Label>
                <Input
                  list="modelli-list"
                  value={form.modello}
                  onChange={(e) => setField("modello", e.target.value)}
                  required
                />
                <datalist id="modelli-list">
                  {modelli.map((m) => (
                    <option key={m.id} value={m.nome} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>N° serie / matricola</Label>
                <Input
                  value={form.numeroSerie}
                  onChange={(e) => setField("numeroSerie", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ubicazione</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={form.ubicazione}
                  onChange={(e) => setField("ubicazione", e.target.value)}
                >
                  <option value="">—</option>
                  {ubicazioni.map((v) => (
                    <option key={v} value={v}>
                      {UBICAZIONE_LABELS[v] || v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivo chiamata</Label>
              <Input
                value={form.motivoChiamata}
                onChange={(e) => setField("motivoChiamata", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrizione intervento</Label>
              <Textarea
                rows={4}
                value={form.descrizione}
                onChange={(e) => setField("descrizione", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Materiali utilizzati</Label>
              <Textarea
                rows={2}
                value={form.materialiUtilizzati}
                onChange={(e) => setField("materialiUtilizzati", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={2}
                value={form.note}
                onChange={(e) => setField("note", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controlli conformità</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {controlli.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={form[field.key as ControlloKey]}
                  onChange={(e) =>
                    setField(field.key as ControlloKey, e.target.value as SiNoNc | "")
                  }
                >
                  <option value="">—</option>
                  {SI_NO_NC_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v === "si" ? "Sì" : v === "no" ? "No" : "N.C."}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.presaVisioneCondizioniGaranzia}
                onChange={(e) => setField("presaVisioneCondizioniGaranzia", e.target.checked)}
              />
              Presa visione condizioni di garanzia / responsabilità
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Firme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <SignaturePad
              label="Firma operatore"
              value={form.firmaOperatore}
              onChange={(v) => setField("firmaOperatore", v)}
            />
            <SignaturePad
              label="Firma cliente"
              value={form.firmaCliente}
              onChange={(v) => setField("firmaCliente", v)}
            />
            <SignaturePad
              label="Firma privacy cliente"
              value={form.firmaClientePrivacy}
              onChange={(v) => setField("firmaClientePrivacy", v)}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/rapportini" className={cn(buttonVariants({ variant: "outline" }))}>
            Annulla
          </Link>
          <Button type="submit" disabled={saving} className="bg-sky-700 hover:bg-sky-800">
            {saving ? "Salvataggio…" : "Salva rapportino"}
          </Button>
        </div>
      </form>
    </div>
  );
}
