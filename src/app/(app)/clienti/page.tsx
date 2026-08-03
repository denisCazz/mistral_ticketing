"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Phone, MapPin, Pencil, Plus } from "lucide-react";

interface Cliente {
  id: string;
  ragioneSociale: string;
  citta: string | null;
  provincia: string | null;
  cellulare: string | null;
  telFisso: string | null;
  email: string | null;
  indirizzo: string | null;
  cap: string | null;
  _count: { pratiche: number };
}

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

const EMPTY: ClienteForm = {
  ragioneSociale: "",
  cellulare: "",
  telFisso: "",
  email: "",
  citta: "",
  provincia: "",
  indirizzo: "",
  cap: "",
};

function clienteToForm(c: Cliente): ClienteForm {
  return {
    ragioneSociale: c.ragioneSociale,
    cellulare: c.cellulare ?? "",
    telFisso: c.telFisso ?? "",
    email: c.email ?? "",
    citta: c.citta ?? "",
    provincia: c.provincia ?? "",
    indirizzo: c.indirizzo ?? "",
    cap: c.cap ?? "",
  };
}

export default function ClientiPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>}>
      <ClientiContent />
    </Suspense>
  );
}

function ClientiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const fetchClienti = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    const res = await fetch(`/api/clienti?${params}`);
    const data = await res.json();
    setClienti(data.clienti ?? []);
    setTotal(data.total ?? 0);
    setTotalPages(data.totalPages ?? 1);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { fetchClienti(); }, [fetchClienti]);

  function doSearch() {
    const p = new URLSearchParams();
    if (searchInput) p.set("search", searchInput);
    router.push(`/clienti?${p}`);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(c: Cliente, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(c);
    setForm(clienteToForm(c));
    setDialogOpen(true);
  }

  async function saveCliente(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = editing
      ? await fetch(`/api/clienti/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      : await fetch("/api/clienti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
    setSaving(false);
    if (!res.ok) {
      toast.error(editing ? "Errore aggiornamento cliente" : "Errore creazione cliente");
      return;
    }
    toast.success(editing ? "Cliente aggiornato" : "Cliente creato");
    setDialogOpen(false);
    setEditing(null);
    fetchClienti();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienti</h1>
          <p className="text-sm text-gray-500 mt-1">{total} clienti in anagrafica</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo cliente
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca per nome, telefono, città, email..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button variant="outline" onClick={doSearch}>Cerca</Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : clienti.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">Nessun cliente trovato</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ragione sociale</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Città</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Telefono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pratiche</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clienti.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/clienti/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.ragioneSociale}</p>
                    {c.email && <p className="text-xs text-gray-500">{c.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.citta && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {c.citta}{c.provincia ? ` (${c.provincia})` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.cellulare && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-gray-400" />
                        {c.cellulare}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {c._count.pratiche} pratiche
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => { const p = new URLSearchParams(searchParams.toString()); p.set("page", String(page - 1)); router.push(`/clienti?${p}`); }}
          >
            Precedente
          </Button>
          <span className="text-sm text-gray-500">Pagina {page} di {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => { const p = new URLSearchParams(searchParams.toString()); p.set("page", String(page + 1)); router.push(`/clienti?${p}`); }}
          >
            Successiva
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica cliente" : "Nuovo cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCliente} className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Ragione sociale *</Label>
              <Input required value={form.ragioneSociale} onChange={(e) => setForm((f) => ({ ...f, ragioneSociale: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cellulare</Label>
                <Input value={form.cellulare} onChange={(e) => setForm((f) => ({ ...f, cellulare: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tel. fisso</Label>
                <Input value={form.telFisso} onChange={(e) => setForm((f) => ({ ...f, telFisso: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Indirizzo</Label>
              <Input value={form.indirizzo} onChange={(e) => setForm((f) => ({ ...f, indirizzo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>CAP</Label>
                <Input value={form.cap} onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Città</Label>
                <Input value={form.citta} onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Provincia</Label>
              <Input value={form.provincia} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={saving}>
                {saving ? "Salvataggio..." : editing ? "Salva modifiche" : "Crea cliente"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
