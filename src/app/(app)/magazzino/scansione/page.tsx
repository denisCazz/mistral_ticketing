"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  PackagePlus,
} from "lucide-react";
import { BarcodeScanner } from "@/components/magazzino/barcode-scanner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isLowStock } from "@/lib/magazzino-utils";

interface Articolo {
  id: string;
  codice: string;
  ean: string | null;
  nome: string;
  unitaMisura: string;
  quantita: number;
  sogliaMinima: number;
  ubicazione: string | null;
}

type Phase =
  | { kind: "scanning" }
  | { kind: "found"; articolo: Articolo; code: string }
  | {
      kind: "unknown";
      code: string;
      suggestedField: "ean" | "codice";
    };

export default function MagazzinoScansionePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    nome: "",
    codice: "",
    ean: "",
    quantita: "0",
  });

  async function handleScan(code: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/magazzino/lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error("Errore lookup");
        return;
      }
      if (data.found) {
        setPhase({ kind: "found", articolo: data.articolo, code });
        setQty("1");
      } else {
        setPhase({
          kind: "unknown",
          code: data.code,
          suggestedField: data.suggestedField,
        });
        setCreateForm({
          nome: "",
          codice: data.suggestedField === "codice" ? data.code : "",
          ean: data.suggestedField === "ean" ? data.code : "",
          quantita: "0",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function doMovimento(tipo: "ENTRATA" | "USCITA") {
    if (phase.kind !== "found") return;
    const quantita = Number(qty);
    if (!Number.isFinite(quantita) || quantita <= 0) {
      toast.error("Quantità non valida");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/magazzino/movimenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articoloId: phase.articolo.id,
          tipo,
          quantita,
          note: `Scan ${phase.code}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Errore movimento");
        return;
      }
      toast.success(
        tipo === "ENTRATA"
          ? `+${quantita} ${data.articolo.unitaMisura}`
          : `−${quantita} ${data.articolo.unitaMisura}`
      );
      setPhase({ kind: "found", articolo: data.articolo, code: phase.code });
      setQty("1");
    } finally {
      setBusy(false);
    }
  }

  async function createFromScan(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind !== "unknown") return;
    setBusy(true);
    try {
      const res = await fetch("/api/magazzino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codice: createForm.codice || phase.code,
          ean: createForm.ean || null,
          nome: createForm.nome,
          quantita: Number(createForm.quantita) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Errore creazione");
        return;
      }
      toast.success("Articolo creato");
      setPhase({ kind: "found", articolo: data, code: phase.code });
      setQty("1");
    } finally {
      setBusy(false);
    }
  }

  function resumeScan() {
    setPhase({ kind: "scanning" });
  }

  const paused = phase.kind !== "scanning";

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/magazzino"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          aria-label="Torna al magazzino"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Scansione</h1>
          <p className="text-sm text-gray-500">QR etichetta o barcode EAN</p>
        </div>
      </div>

      <BarcodeScanner
        onScan={(code) => void handleScan(code)}
        paused={paused || busy}
        className="aspect-[3/4] sm:aspect-video w-full"
      />

      {phase.kind === "found" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4">
          <div>
            <p className="text-xs text-sky-700 font-medium uppercase tracking-wide">
              Articolo trovato
            </p>
            <h2 className="text-lg font-bold text-gray-900 mt-1">{phase.articolo.nome}</h2>
            <p className="text-xs font-mono text-gray-500 mt-0.5">
              {phase.articolo.codice}
              {phase.articolo.ean ? ` · EAN ${phase.articolo.ean}` : ""}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
              {phase.articolo.quantita}
              <span className="text-sm font-normal text-gray-500 ml-1">
                {phase.articolo.unitaMisura}
              </span>
              {isLowStock(phase.articolo.quantita, phase.articolo.sogliaMinima) && (
                <span className="ml-2 text-sm font-medium text-amber-700">sotto scorta</span>
              )}
            </p>
            {phase.articolo.ubicazione && (
              <p className="text-sm text-gray-500 mt-1">{phase.articolo.ubicazione}</p>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="qty">Quantità</Label>
              <Input
                id="qty"
                type="number"
                min="0.001"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="bg-white text-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 h-12"
              onClick={() => void doMovimento("ENTRATA")}
            >
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Entrata
            </Button>
            <Button
              disabled={busy}
              className="bg-orange-600 hover:bg-orange-700 h-12"
              onClick={() => void doMovimento("USCITA")}
            >
              <ArrowUpFromLine className="h-4 w-4 mr-2" />
              Uscita
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resumeScan}>
              Continua a scansionare
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/magazzino/${phase.articolo.id}`)}
            >
              Dettaglio
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "unknown" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
          <div className="flex items-start gap-2">
            <PackagePlus className="h-5 w-5 text-amber-700 mt-0.5" />
            <div>
              <h2 className="font-semibold text-gray-900">Codice sconosciuto</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                <span className="font-mono">{phase.code}</span> non è in magazzino.
                Crealo subito.
              </p>
            </div>
          </div>

          <form onSubmit={createFromScan} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-nome">Nome *</Label>
              <Input
                id="new-nome"
                required
                className="bg-white"
                value={createForm.nome}
                onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-codice">Codice</Label>
                <Input
                  id="new-codice"
                  required
                  className="bg-white font-mono"
                  value={createForm.codice}
                  onChange={(e) => setCreateForm({ ...createForm, codice: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-ean">EAN</Label>
                <Input
                  id="new-ean"
                  inputMode="numeric"
                  className="bg-white font-mono"
                  value={createForm.ean}
                  onChange={(e) => setCreateForm({ ...createForm, ean: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-qty">Giacenza iniziale</Label>
              <Input
                id="new-qty"
                type="number"
                min="0"
                step="any"
                className="bg-white"
                value={createForm.quantita}
                onChange={(e) => setCreateForm({ ...createForm, quantita: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={resumeScan}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="flex-1 bg-sky-700 hover:bg-sky-800"
              >
                Crea articolo
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
