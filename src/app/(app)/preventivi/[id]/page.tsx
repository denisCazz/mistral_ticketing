"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import {
  STATO_PREVENTIVO_LABELS,
  statiPreventivoTarget,
} from "@/lib/preventivo-constants";
import {
  isPreventivoBozzaEmpty,
  normalizePreventivoBozza,
} from "@/lib/preventivo-ai";
import {
  PreventivoRigheEditor,
  type PreventivoRigaForm,
} from "@/components/preventivo-righe-editor";
import { StatoPreventivo } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "next-auth/react";
import { Download, Sparkles, Save } from "lucide-react";

type Riga = PreventivoRigaForm;

export default function PreventivoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [fonti, setFonti] = useState<
    Array<{ titolo: string; excerpt: string; similarity: number }>
  >([]);

  const [numeroPreventivo, setNumeroPreventivo] = useState("");
  const [stato, setStato] = useState<StatoPreventivo>("BOZZA");
  const [versione, setVersione] = useState(1);
  const [clienteNome, setClienteNome] = useState("");
  const [introduzione, setIntroduzione] = useState("");
  const [condizioni, setCondizioni] = useState("");
  const [validoFino, setValidoFino] = useState("");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [storia, setStoria] = useState<
    Array<{ statoA: StatoPreventivo; changedAt: string; changedBy: { name: string }; note?: string }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/preventivi/${id}`);
    if (!res.ok) {
      toast.error("Preventivo non trovato");
      setLoading(false);
      return;
    }
    const p = await res.json();
    setNumeroPreventivo(p.numeroPreventivo);
    setStato(p.stato);
    setVersione(p.versione);
    setClienteNome(p.cliente.ragioneSociale);
    setIntroduzione(p.introduzione ?? "");
    setCondizioni(p.condizioni ?? "");
    setValidoFino(p.validoFino ? p.validoFino.slice(0, 10) : "");
    setRighe(
      p.righe.map((r: Riga) => ({
        id: r.id,
        descrizione: r.descrizione,
        quantita: Number(r.quantita),
        prezzoUnitario: Number(r.prezzoUnitario),
        scontoPercentuale: Number(r.scontoPercentuale),
        aliquotaIva: Number(r.aliquotaIva),
      }))
    );
    setStoria(p.storia ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const statiDisponibili = statiPreventivoTarget(session?.user?.role, stato);

  async function save(createVersion = false) {
    setSaving(true);
    const res = await fetch(`/api/preventivi/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        introduzione,
        condizioni,
        validoFino: validoFino || null,
        righe,
        createVersion,
        motivoVersione: createVersion ? "Revisione manuale" : undefined,
        expectedVersion: versione,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Errore salvataggio");
      return;
    }
    toast.success(createVersion ? "Versione salvata" : "Salvato");
    load();
  }

  async function changeStato(newStato: StatoPreventivo) {
    const res = await fetch(`/api/preventivi/${id}/stato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: newStato }),
    });
    if (!res.ok) {
      toast.error("Cambio stato non consentito");
      return;
    }
    toast.success("Stato aggiornato");
    load();
  }

  async function exportFile(formato: "PDF" | "DOCX") {
    const res = await fetch(`/api/preventivi/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formato }),
    });
    if (!res.ok) {
      toast.error("Export fallito");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${numeroPreventivo}.${formato === "DOCX" ? "docx" : "pdf"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generaAi() {
    if (!aiPrompt.trim()) {
      toast.error("Inserisci una descrizione per l'AI");
      return;
    }
    setAiLoading(true);
    const res = await fetch(`/api/preventivi/${id}/genera`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt }),
    });
    setAiLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(
        typeof err.error === "string"
          ? err.error
          : `Generazione AI fallita (${res.status})`
      );
      return;
    }
    const data = await res.json();
    const bozza = normalizePreventivoBozza(data.bozza);
    if (!bozza || isPreventivoBozzaEmpty(bozza)) {
      toast.error(
        "L'AI non ha prodotto una bozza utilizzabile. Riprova con una descrizione più dettagliata."
      );
      return;
    }
    setIntroduzione(bozza.introduzione);
    setCondizioni(bozza.condizioni);
    if (bozza.righe.length > 0) {
      setRighe(bozza.righe);
    }
    setFonti(data.fonti ?? []);
    toast.success(
      data.fonti?.length
        ? "Bozza AI generata — revisiona e salva"
        : "Bozza AI generata (senza fonti documentali) — revisiona prezzi e salva"
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/preventivi" className="text-sm text-sky-700">← Preventivi</Link>
          <h1 className="text-2xl font-bold mt-2">{numeroPreventivo}</h1>
          <p className="text-gray-600">{clienteNome}</p>
          <div className="mt-2 flex items-center gap-2">
            <PreventivoStatoBadge stato={stato} />
            <span className="text-xs text-gray-500">v{versione}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportFile("PDF")}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" onClick={() => exportFile("DOCX")}>
            <Download className="h-4 w-4 mr-1" /> DOCX
          </Button>
          <Button onClick={() => save(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Salva
          </Button>
          <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
            Salva versione
          </Button>
        </div>
      </div>

      {statiDisponibili.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Label className="text-sm">Cambia stato:</Label>
          {statiDisponibili.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => changeStato(s)}>
              {STATO_PREVENTIVO_LABELS[s]}
            </Button>
          ))}
        </div>
      )}

      <div className="border rounded-lg p-4 bg-sky-50 space-y-3">
        <Label>Genera bozza con AI</Label>
        <Textarea
          placeholder="Descrivi l'intervento o il preventivo da preparare..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={2}
        />
        <Button onClick={generaAi} disabled={aiLoading}>
          <Sparkles className="h-4 w-4 mr-1" />
          {aiLoading ? "Generazione..." : "Genera bozza"}
        </Button>
        {fonti.length > 0 && (
          <div className="text-xs text-gray-600 space-y-1">
            <p className="font-medium">Fonti usate:</p>
            {fonti.map((f, i) => (
              <p key={i}>
                {f.titolo} ({(f.similarity * 100).toFixed(0)}%)
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Introduzione</Label>
        <Textarea value={introduzione} onChange={(e) => setIntroduzione(e.target.value)} rows={4} />
      </div>

      <div className="space-y-2">
        <Label>Valido fino</Label>
        <Input type="date" value={validoFino} onChange={(e) => setValidoFino(e.target.value)} />
      </div>

      <PreventivoRigheEditor righe={righe} onChange={setRighe} />

      <div className="space-y-2">
        <Label>Condizioni</Label>
        <Textarea value={condizioni} onChange={(e) => setCondizioni(e.target.value)} rows={3} />
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Storico stati</h2>
        <ul className="space-y-2 text-sm">
          {storia.map((s, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                <PreventivoStatoBadge stato={s.statoA} />
                {s.note ? ` — ${s.note}` : ""}
              </span>
              <span className="text-gray-500">
                {s.changedBy.name} · {new Date(s.changedAt).toLocaleString("it-IT")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
