"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Package,
  Plus,
  ScanLine,
  Search,
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
}

interface ArticoloForm {
  codice: string;
  ean: string;
  nome: string;
  descrizione: string;
  unitaMisura: string;
  quantita: string;
  sogliaMinima: string;
  ubicazione: string;
}

const EMPTY: ArticoloForm = {
  codice: "",
  ean: "",
  nome: "",
  descrizione: "",
  unitaMisura: "pz",
  quantita: "0",
  sogliaMinima: "0",
  ubicazione: "",
};

export default function MagazzinoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      }
    >
      <MagazzinoContent />
    </Suspense>
  );
}

function MagazzinoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ArticoloForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const search = searchParams.get("search") ?? "";
  const lowStock = searchParams.get("lowStock") === "1";
  const page = parseInt(searchParams.get("page") ?? "1") || 1;

  const fetchArticoli = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (lowStock) params.set("lowStock", "true");
    params.set("page", String(page));
    const res = await fetch(`/api/magazzino?${params}`);
    const data = await res.json();
    setArticoli(data.articoli ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, lowStock, page]);

  useEffect(() => {
    void fetchArticoli();
  }, [fetchArticoli]);

  function doSearch() {
    const p = new URLSearchParams();
    if (searchInput.trim()) p.set("search", searchInput.trim());
    if (lowStock) p.set("lowStock", "1");
    router.push(`/magazzino?${p}`);
  }

  function toggleLowStock() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (!lowStock) p.set("lowStock", "1");
    router.push(`/magazzino?${p}`);
  }

  async function saveArticolo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/magazzino", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codice: form.codice,
        ean: form.ean || null,
        nome: form.nome,
        descrizione: form.descrizione || null,
        unitaMisura: form.unitaMisura || "pz",
        quantita: Number(form.quantita) || 0,
        sogliaMinima: Number(form.sogliaMinima) || 0,
        ubicazione: form.ubicazione || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Errore creazione articolo");
      return;
    }
    const created = (await res.json()) as Articolo;
    toast.success("Articolo creato");
    setDialogOpen(false);
    setForm(EMPTY);
    router.push(`/magazzino/${created.id}`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Magazzino</h1>
          <p className="text-sm text-gray-500 mt-1">{total} articoli</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/magazzino/scansione"
            className={cn(buttonVariants(), "bg-sky-700 hover:bg-sky-800")}
          >
            <ScanLine className="h-4 w-4 mr-2" />
            Scansiona
          </Link>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            onClick={() => {
              setForm(EMPTY);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuovo articolo
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca codice, EAN, nome, ubicazione…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button variant="outline" onClick={doSearch}>
          Cerca
        </Button>
        <Button
          variant={lowStock ? "default" : "outline"}
          className={lowStock ? "bg-amber-600 hover:bg-amber-700" : undefined}
          onClick={toggleLowStock}
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Sotto scorta
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      ) : articoli.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm border border-dashed rounded-lg bg-white">
          <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          Nessun articolo trovato.
          <div className="mt-4">
            <Link
              href="/magazzino/scansione"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ScanLine className="h-4 w-4 mr-2" />
              Aggiungi scansionando un codice
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {articoli.map((a) => {
              const low = isLowStock(a.quantita, a.sogliaMinima);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => router.push(`/magazzino/${a.id}`)}
                  className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-sky-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{a.nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        {a.codice}
                        {a.ean ? ` · EAN ${a.ean}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          low ? "text-amber-700" : "text-gray-900"
                        )}
                      >
                        {a.quantita}
                        <span className="text-xs font-normal text-gray-500 ml-1">
                          {a.unitaMisura}
                        </span>
                      </p>
                      {low && (
                        <Badge className="mt-1 bg-amber-100 text-amber-800 border-amber-200">
                          Sotto scorta
                        </Badge>
                      )}
                    </div>
                  </div>
                  {a.ubicazione && (
                    <p className="text-xs text-gray-500 mt-2">{a.ubicazione}</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Articolo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Codice / EAN</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ubicazione</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Giacenza</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {articoli.map((a) => {
                  const low = isLowStock(a.quantita, a.sogliaMinima);
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/magazzino/${a.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{a.nome}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        <div>{a.codice}</div>
                        {a.ean && <div className="text-gray-400">{a.ean}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{a.ubicazione || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={low ? "text-amber-700 font-semibold" : ""}>
                          {a.quantita}
                        </span>{" "}
                        <span className="text-gray-400">{a.unitaMisura}</span>
                      </td>
                      <td className="px-4 py-3">
                        {low ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            Sotto scorta
                          </Badge>
                        ) : (
                          <span className="text-gray-400">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo articolo</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveArticolo} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="codice">Codice interno (QR) *</Label>
                <Input
                  id="codice"
                  required
                  value={form.codice}
                  onChange={(e) => setForm({ ...form, codice: e.target.value })}
                  placeholder="es. CAV-NYM-2.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ean">EAN</Label>
                <Input
                  id="ean"
                  inputMode="numeric"
                  value={form.ean}
                  onChange={(e) => setForm({ ...form, ean: e.target.value })}
                  placeholder="8001234567890"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descrizione">Descrizione</Label>
              <Input
                id="descrizione"
                value={form.descrizione}
                onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantita">Giacenza</Label>
                <Input
                  id="quantita"
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantita}
                  onChange={(e) => setForm({ ...form, quantita: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="um">U.M.</Label>
                <Input
                  id="um"
                  value={form.unitaMisura}
                  onChange={(e) => setForm({ ...form, unitaMisura: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="soglia">Soglia min.</Label>
                <Input
                  id="soglia"
                  type="number"
                  min="0"
                  step="any"
                  value={form.sogliaMinima}
                  onChange={(e) => setForm({ ...form, sogliaMinima: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ubicazione">Ubicazione</Label>
              <Input
                id="ubicazione"
                value={form.ubicazione}
                onChange={(e) => setForm({ ...form, ubicazione: e.target.value })}
                placeholder="es. Scaffale A3"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-sky-700 hover:bg-sky-800"
              >
                {saving ? "Salvataggio…" : "Crea"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
