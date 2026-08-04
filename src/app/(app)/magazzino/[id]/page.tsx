"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Pencil,
  ScanLine,
  SlidersHorizontal,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isLowStock } from "@/lib/magazzino-utils";

interface Movimento {
  id: string;
  tipo: "ENTRATA" | "USCITA" | "RETTIFICA";
  quantita: number;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

interface Articolo {
  id: string;
  codice: string;
  ean: string | null;
  nome: string;
  descrizione: string | null;
  unitaMisura: string;
  quantita: number;
  sogliaMinima: number;
  ubicazione: string | null;
  attivo: boolean;
  movimenti: Movimento[];
}

export default function ArticoloDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [articolo, setArticolo] = useState<Articolo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState<"ENTRATA" | "USCITA" | "RETTIFICA" | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    codice: "",
    ean: "",
    nome: "",
    descrizione: "",
    unitaMisura: "pz",
    sogliaMinima: "0",
    ubicazione: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/magazzino/${id}`);
    if (!res.ok) {
      setArticolo(null);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as Articolo;
    setArticolo(data);
    setForm({
      codice: data.codice,
      ean: data.ean ?? "",
      nome: data.nome,
      descrizione: data.descrizione ?? "",
      unitaMisura: data.unitaMisura,
      sogliaMinima: String(data.sogliaMinima),
      ubicazione: data.ubicazione ?? "",
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/magazzino/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codice: form.codice,
        ean: form.ean || null,
        nome: form.nome,
        descrizione: form.descrizione || null,
        unitaMisura: form.unitaMisura,
        sogliaMinima: Number(form.sogliaMinima) || 0,
        ubicazione: form.ubicazione || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Errore salvataggio");
      return;
    }
    toast.success("Articolo aggiornato");
    setEditOpen(false);
    void load();
  }

  async function doMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!moveOpen || !articolo) return;
    const quantita = Number(qty);
    if (!Number.isFinite(quantita) || quantita <= 0) {
      toast.error("Quantità non valida");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/magazzino/movimenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articoloId: articolo.id,
        tipo: moveOpen,
        quantita,
        note: note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Errore movimento");
      return;
    }
    toast.success("Movimento registrato");
    setMoveOpen(null);
    setQty("1");
    setNote("");
    void load();
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
      </div>
    );
  }

  if (!articolo) {
    return (
      <div className="p-6 text-center text-gray-500">
        Articolo non trovato.{" "}
        <Link href="/magazzino" className="text-sky-700 underline">
          Torna al magazzino
        </Link>
      </div>
    );
  }

  const low = isLowStock(articolo.quantita, articolo.sogliaMinima);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <Link
          href="/magazzino"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "mt-0.5")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{articolo.nome}</h1>
            {!articolo.attivo && (
              <Badge className="bg-gray-100 text-gray-600">Disattivato</Badge>
            )}
            {low && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Sotto scorta
              </Badge>
            )}
          </div>
          <p className="text-sm font-mono text-gray-500 mt-1">
            {articolo.codice}
            {articolo.ean ? ` · EAN ${articolo.ean}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-white p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500">Giacenza</p>
          <p className={cn("text-2xl font-bold tabular-nums", low && "text-amber-700")}>
            {articolo.quantita}
            <span className="text-sm font-normal text-gray-500 ml-1">
              {articolo.unitaMisura}
            </span>
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500">Soglia min.</p>
          <p className="text-xl font-semibold tabular-nums">{articolo.sogliaMinima}</p>
        </div>
        <div className="rounded-lg border bg-white p-4 col-span-2">
          <p className="text-xs text-gray-500">Ubicazione</p>
          <p className="text-lg font-medium">{articolo.ubicazione || "—"}</p>
        </div>
      </div>

      {articolo.descrizione && (
        <p className="text-sm text-gray-600">{articolo.descrizione}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => {
            setMoveOpen("ENTRATA");
            setQty("1");
            setNote("");
          }}
        >
          <ArrowDownToLine className="h-4 w-4 mr-2" />
          Entrata
        </Button>
        <Button
          className="bg-orange-600 hover:bg-orange-700"
          onClick={() => {
            setMoveOpen("USCITA");
            setQty("1");
            setNote("");
          }}
        >
          <ArrowUpFromLine className="h-4 w-4 mr-2" />
          Uscita
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setMoveOpen("RETTIFICA");
            setQty(String(articolo.quantita));
            setNote("");
          }}
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Rettifica
        </Button>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Modifica
        </Button>
        <Link
          href="/magazzino/scansione"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <ScanLine className="h-4 w-4 mr-2" />
          Scanner
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Ultimi movimenti</h2>
        {articolo.movimenti.length === 0 ? (
          <p className="text-sm text-gray-500">Nessun movimento ancora.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {articolo.movimenti.map((m) => (
              <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">
                    <TipoBadge tipo={m.tipo} />{" "}
                    <span className="tabular-nums">
                      {m.tipo === "USCITA" ? "−" : m.tipo === "ENTRATA" ? "+" : "="}
                      {m.quantita} {articolo.unitaMisura}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.user.name}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <time className="text-xs text-gray-400 shrink-0">
                  {format(new Date(m.createdAt), "d MMM yyyy HH:mm", { locale: it })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica articolo</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Codice *</Label>
                <Input
                  required
                  value={form.codice}
                  onChange={(e) => setForm({ ...form, codice: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>EAN</Label>
                <Input
                  inputMode="numeric"
                  value={form.ean}
                  onChange={(e) => setForm({ ...form, ean: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Input
                value={form.descrizione}
                onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>U.M.</Label>
                <Input
                  value={form.unitaMisura}
                  onChange={(e) => setForm({ ...form, unitaMisura: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Soglia</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.sogliaMinima}
                  onChange={(e) => setForm({ ...form, sogliaMinima: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ubicazione</Label>
                <Input
                  value={form.ubicazione}
                  onChange={(e) => setForm({ ...form, ubicazione: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={busy} className="bg-sky-700 hover:bg-sky-800">
                Salva
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveOpen} onOpenChange={(o) => !o && setMoveOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {moveOpen === "ENTRATA"
                ? "Entrata merce"
                : moveOpen === "USCITA"
                  ? "Uscita merce"
                  : "Rettifica giacenza"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={doMovimento} className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                {moveOpen === "RETTIFICA" ? "Nuova giacenza" : "Quantità"}
              </Label>
              <Input
                type="number"
                min="0.001"
                step="any"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMoveOpen(null)}>
                Annulla
              </Button>
              <Button type="submit" disabled={busy} className="bg-sky-700 hover:bg-sky-800">
                Conferma
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: Movimento["tipo"] }) {
  const styles =
    tipo === "ENTRATA"
      ? "bg-emerald-100 text-emerald-800"
      : tipo === "USCITA"
        ? "bg-orange-100 text-orange-800"
        : "bg-sky-100 text-sky-800";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold", styles)}>
      {tipo}
    </span>
  );
}
