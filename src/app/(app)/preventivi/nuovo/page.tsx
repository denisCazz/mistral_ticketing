"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PreventivoRigheEditor,
  EMPTY_RIGA,
  type PreventivoRigaForm,
} from "@/components/preventivo-righe-editor";
import {
  isPreventivoBozzaEmpty,
  normalizePreventivoBozza,
} from "@/lib/preventivo-ai";

interface Cliente {
  id: string;
  ragioneSociale: string;
}

type Riga = PreventivoRigaForm;

interface ClienteForm {
  ragioneSociale: string;
  cellulare: string;
  telFisso: string;
  email: string;
  citta: string;
  provincia: string;
  indirizzo: string;
  cap: string;
}

const EMPTY_CLIENTE: ClienteForm = {
  ragioneSociale: "",
  cellulare: "",
  telFisso: "",
  email: "",
  citta: "",
  provincia: "",
  indirizzo: "",
  cap: "",
};

export default function NuovoPreventivoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      }
    >
      <NuovoPreventivoContent />
    </Suspense>
  );
}

function NuovoPreventivoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCliente = searchParams.get("clienteId") ?? "";
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState(preselectedCliente);
  const [introduzione, setIntroduzione] = useState("");
  const [condizioni, setCondizioni] = useState("");
  const [validoFino, setValidoFino] = useState("");
  const [righe, setRighe] = useState<Riga[]>([{ ...EMPTY_RIGA }]);
  const [loading, setLoading] = useState(false);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [clienteForm, setClienteForm] = useState<ClienteForm>(EMPTY_CLIENTE);
  const [savingCliente, setSavingCliente] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [fonti, setFonti] = useState<
    Array<{ titolo: string; excerpt: string; similarity: number }>
  >([]);

  useEffect(() => {
    fetch("/api/clienti?limit=200")
      .then((r) => r.json())
      .then((d) => setClienti(d.clienti ?? []));
  }, []);

  async function createCliente(e: React.FormEvent) {
    e.preventDefault();
    setSavingCliente(true);
    const res = await fetch("/api/clienti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clienteForm),
    });
    setSavingCliente(false);
    if (!res.ok) {
      toast.error("Errore creazione cliente");
      return;
    }
    const cliente = await res.json();
    setClienti((prev) =>
      [...prev, { id: cliente.id, ragioneSociale: cliente.ragioneSociale }].sort(
        (a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale, "it")
      )
    );
    setClienteId(cliente.id);
    setClienteDialogOpen(false);
    setClienteForm(EMPTY_CLIENTE);
    toast.success("Cliente creato e selezionato");
  }

  async function generaAi() {
    if (!aiPrompt.trim()) {
      toast.error("Inserisci una descrizione per l'AI");
      return;
    }
    setAiLoading(true);
    const res = await fetch("/api/preventivi/genera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: aiPrompt,
        clienteId: clienteId || undefined,
      }),
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
        ? "Bozza AI generata — revisiona e crea il preventivo"
        : "Bozza AI generata (senza fonti documentali) — revisiona prezzi e crea"
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) {
      toast.error("Seleziona o crea un cliente");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/preventivi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        introduzione,
        condizioni,
        validoFino: validoFino || null,
        righe,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Errore creazione preventivo");
      return;
    }
    const p = await res.json();
    toast.success("Preventivo creato");
    router.push(`/preventivi/${p.id}`);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/preventivi" className="text-sm text-sky-700">← Preventivi</Link>
        <h1 className="text-2xl font-bold mt-2">Nuovo preventivo</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? "")}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleziona cliente" />
              </SelectTrigger>
              <SelectContent>
                {clienti.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.ragioneSociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setClienteForm(EMPTY_CLIENTE);
                setClienteDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nuovo cliente
            </Button>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-sky-50 space-y-3">
          <Label>Genera bozza con AI</Label>
          <Textarea
            placeholder="Descrivi l'intervento o il preventivo da preparare..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={2}
          />
          <Button type="button" onClick={generaAi} disabled={aiLoading}>
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

        <Button type="submit" disabled={loading}>
          {loading ? "Creazione..." : "Crea preventivo"}
        </Button>
      </form>

      <Dialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCliente} className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Ragione sociale *</Label>
              <Input
                required
                value={clienteForm.ragioneSociale}
                onChange={(e) =>
                  setClienteForm((f) => ({ ...f, ragioneSociale: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cellulare</Label>
                <Input
                  value={clienteForm.cellulare}
                  onChange={(e) =>
                    setClienteForm((f) => ({ ...f, cellulare: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Tel. fisso</Label>
                <Input
                  value={clienteForm.telFisso}
                  onChange={(e) =>
                    setClienteForm((f) => ({ ...f, telFisso: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={clienteForm.email}
                onChange={(e) =>
                  setClienteForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Indirizzo</Label>
              <Input
                value={clienteForm.indirizzo}
                onChange={(e) =>
                  setClienteForm((f) => ({ ...f, indirizzo: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>CAP</Label>
                <Input
                  value={clienteForm.cap}
                  onChange={(e) =>
                    setClienteForm((f) => ({ ...f, cap: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Città</Label>
                <Input
                  value={clienteForm.citta}
                  onChange={(e) =>
                    setClienteForm((f) => ({ ...f, citta: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Provincia</Label>
              <Input
                value={clienteForm.provincia}
                onChange={(e) =>
                  setClienteForm((f) => ({ ...f, provincia: e.target.value }))
                }
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setClienteDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={savingCliente}>
                {savingCliente ? "Salvataggio..." : "Crea cliente"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
