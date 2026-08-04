"use client";

import { useEffect, useRef, useState } from "react";
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
import { isLowStock, looksLikeEan } from "@/lib/magazzino-utils";

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
  | { kind: "unknown"; code: string };

export default function MagazzinoScansionePage() {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    nome: "",
    codice: "",
    ean: "",
    quantita: "1",
    ubicazione: "",
  });

  useEffect(() => {
    if (phase.kind === "unknown" || phase.kind === "found") {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase.kind]);

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
        setPhase({ kind: "found", articolo: data.articolo, code: data.code });
        setQty("1");
        toast.success("Articolo riconosciuto");
      } else {
        const scanned = String(data.code ?? code);
        const isEan = looksLikeEan(scanned);
        setPhase({ kind: "unknown", code: scanned });
        setCreateForm({
          nome: "",
          // Sempre un codice interno: se è EAN lo usiamo anche come codice
          codice: scanned,
          ean: isEan ? scanned : "",
          quantita: "1",
          ubicazione: "",
        });
        toast.message("Codice non in magazzino", {
          description: "Compila il nome e crea l'articolo.",
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
    const nome = createForm.nome.trim();
    const codice = (createForm.codice || phase.code).trim();
    if (!nome) {
      toast.error("Inserisci il nome dell'articolo");
      return;
    }
    if (!codice) {
      toast.error("Codice mancante");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/magazzino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codice,
          ean: createForm.ean.trim() || null,
          nome,
          quantita: Number(createForm.quantita) || 0,
          ubicazione: createForm.ubicazione.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Errore creazione");
        return;
      }
      toast.success("Articolo creato — puoi fare entrata/uscita");
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
    <div className="p-4 sm:p-6 space-y-4 max-w-xl mx-auto pb-28">
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
          <p className="text-sm text-gray-500">
            QR / EAN · se non riconosciuto puoi creare l&apos;articolo
          </p>
        </div>
      </div>

      <BarcodeScanner
        onScan={(code) => void handleScan(code)}
        paused={paused || busy}
        className={cn(
          "w-full transition-all",
          paused ? "aspect-video max-h-48 sm:max-h-56" : "aspect-[3/4] sm:aspect-video"
        )}
      />

      {phase.kind === "scanning" && (
        <p className="text-center text-sm text-gray-500">
          Inquadra un codice. Se è nuovo, apparirà il form di creazione.
        </p>
      )}

      {phase.kind === "found" && (
        <div
          ref={panelRef}
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4"
        >
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
        <div
          ref={panelRef}
          className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-4 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <PackagePlus className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-gray-900">Nuovo articolo</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Codice <span className="font-mono font-medium">{phase.code}</span> non
                riconosciuto. Inserisci almeno il nome e salva.
              </p>
            </div>
          </div>

          <form onSubmit={createFromScan} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-nome">Nome articolo *</Label>
              <Input
                id="new-nome"
                required
                autoFocus
                className="bg-white"
                placeholder="es. Interruttore magnetotermico 16A"
                value={createForm.nome}
                onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-codice">Codice interno *</Label>
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
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label htmlFor="new-ubi">Ubicazione</Label>
                <Input
                  id="new-ubi"
                  className="bg-white"
                  placeholder="Scaffale…"
                  value={createForm.ubicazione}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, ubicazione: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={resumeScan}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="flex-1 bg-sky-700 hover:bg-sky-800 h-11"
              >
                <PackagePlus className="h-4 w-4 mr-2" />
                {busy ? "Creazione…" : "Crea articolo"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
