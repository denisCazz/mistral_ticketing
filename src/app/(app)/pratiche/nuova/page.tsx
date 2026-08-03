"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, ArrowLeft, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { STATO_LABELS, STATI_ORDINE } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import { useSession } from "next-auth/react";

interface Cliente {
  id: string;
  ragioneSociale: string;
  citta: string | null;
  cellulare: string | null;
}

interface Operatore {
  id: string;
  name: string;
}

const EMPTY_CLIENTE = {
  ragioneSociale: "",
  cellulare: "",
  citta: "",
  email: "",
};

export default function NuovaPraticaPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>}>
      <NuovaPraticaContent />
    </Suspense>
  );
}

function NuovaPraticaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [searchQuery, setSearchQuery] = useState("");
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [operatoriList, setOperatoriList] = useState<Operatore[]>([]);
  const [loading, setLoading] = useState(false);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [clienteForm, setClienteForm] = useState(EMPTY_CLIENTE);
  const [creatingCliente, setCreatingCliente] = useState(false);

  const [form, setForm] = useState({
    tipoIntervento: "",
    descrizione: "",
    operatoreId: "",
    stato: "RICEVUTA" as StatoPratica,
    noteInterne: "",
  });

  useEffect(() => {
    const clienteId = searchParams.get("clienteId");
    if (clienteId) {
      fetch(`/api/clienti/${clienteId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => c && setSelectedCliente(c));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/utenti?assegnabili=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Operatore[]) => setOperatoriList(Array.isArray(data) ? data : []));
  }, [isAdmin]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setClienti([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/clienti?search=${encodeURIComponent(searchQuery)}&limit=8`)
        .then((r) => r.json())
        .then((data) => setClienti(data.clienti ?? []))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function createCliente(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteForm.ragioneSociale.trim()) {
      toast.error("Inserisci la ragione sociale");
      return;
    }
    setCreatingCliente(true);
    const res = await fetch("/api/clienti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clienteForm),
    });
    setCreatingCliente(false);
    if (!res.ok) {
      toast.error("Errore durante la creazione del cliente");
      return;
    }
    const cliente = await res.json();
    setSelectedCliente(cliente);
    setClienteDialogOpen(false);
    setClienteForm(EMPTY_CLIENTE);
    setSearchQuery("");
    setClienti([]);
    toast.success("Cliente creato");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCliente) {
      toast.error("Seleziona un cliente");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/pratiche", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: selectedCliente.id,
        tipoIntervento: form.tipoIntervento,
        descrizione: form.descrizione,
        operatoreId: form.operatoreId || undefined,
        stato: form.stato,
        noteInterne: form.noteInterne,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Errore durante la creazione della pratica");
      return;
    }
    const pratica = await res.json();
    toast.success(`Pratica ${pratica.numeroPratica} creata`);
    router.push(`/pratiche/${pratica.id}`);
  }

  const showNoResults = searchQuery.length >= 2 && !searchLoading && clienti.length === 0;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pratiche">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuova pratica</h1>
          <p className="text-sm text-gray-500">Compila i dati per aprire una nuova pratica</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cliente *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedCliente ? (
              <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{selectedCliente.ragioneSociale}</p>
                  <p className="text-xs text-gray-500">{selectedCliente.citta} — {selectedCliente.cellulare}</p>
                </div>
                <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedCliente(null)}>Cambia</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Cerca per nome, telefono, città..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {searchLoading && (
                  <p className="text-xs text-gray-400 px-1">Ricerca in corso...</p>
                )}
                {clienti.length > 0 && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white shadow-sm">
                    {clienti.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                        onClick={() => { setSelectedCliente(c); setSearchQuery(""); setClienti([]); }}
                      >
                        <p className="text-sm font-medium text-gray-900">{c.ragioneSociale}</p>
                        <p className="text-xs text-gray-500">{c.citta} — {c.cellulare}</p>
                      </button>
                    ))}
                  </div>
                )}
                {showNoResults && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center space-y-3">
                    <p className="text-sm text-gray-500">Nessun cliente trovato per &ldquo;{searchQuery}&rdquo;</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setClienteForm((f) => ({ ...f, ragioneSociale: searchQuery }));
                        setClienteDialogOpen(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Aggiungi cliente
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dettagli intervento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="tipoIntervento">Tipo intervento</Label>
              <Input
                id="tipoIntervento"
                placeholder="es. Manutenzione periodica estintori / verifica quadro elettrico"
                value={form.tipoIntervento}
                onChange={(e) => setForm((f) => ({ ...f, tipoIntervento: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="descrizione">Descrizione problema</Label>
              <Textarea
                id="descrizione"
                placeholder="Descrivi il problema segnalato dal cliente..."
                rows={3}
                value={form.descrizione}
                onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              />
            </div>
            {isAdmin && (
              <div className="space-y-1">
                <Label htmlFor="operatore">Assegna operatore</Label>
                <Select
                  value={form.operatoreId || "self"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, operatoreId: v === "self" ? "" : (v ?? "") }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Me stesso">
                      {form.operatoreId
                        ? operatoriList.find((o) => o.id === form.operatoreId)?.name
                        : "Me stesso"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Me stesso</SelectItem>
                    {operatoriList.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="stato">Assegna stato</Label>
              <Select
                value={form.stato}
                onValueChange={(v) => setForm((f) => ({ ...f, stato: v as StatoPratica }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATI_ORDINE.map((s) => (
                    <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="noteInterne">Note interne</Label>
              <Textarea
                id="noteInterne"
                placeholder="Note visibili solo agli operatori..."
                rows={2}
                value={form.noteInterne}
                onChange={(e) => setForm((f) => ({ ...f, noteInterne: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Link href="/pratiche">
            <Button variant="outline" type="button">Annulla</Button>
          </Link>
          <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
            {loading ? "Creazione..." : "Crea pratica"}
          </Button>
        </div>
      </form>

      <Dialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCliente} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="ragioneSociale">Ragione sociale *</Label>
              <Input
                id="ragioneSociale"
                required
                value={clienteForm.ragioneSociale}
                onChange={(e) => setClienteForm((f) => ({ ...f, ragioneSociale: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cellulare">Cellulare</Label>
              <Input
                id="cellulare"
                value={clienteForm.cellulare}
                onChange={(e) => setClienteForm((f) => ({ ...f, cellulare: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="citta">Città</Label>
              <Input
                id="citta"
                value={clienteForm.citta}
                onChange={(e) => setClienteForm((f) => ({ ...f, citta: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={clienteForm.email}
                onChange={(e) => setClienteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setClienteDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={creatingCliente}>
                <Plus className="h-4 w-4 mr-2" />
                {creatingCliente ? "Creazione..." : "Crea cliente"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
