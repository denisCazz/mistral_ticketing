"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatoBadge } from "@/components/stato-badge";
import { STATO_LABELS, STATI_ORDINE, statiTargetDisponibili } from "@/lib/constants";
import { canManageStati } from "@/lib/access";
import { StatoPratica } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Plus, Search, Building2, Tag } from "lucide-react";
import { useSession } from "next-auth/react";

interface Pratica {
  id: string;
  numeroPratica: string;
  stato: StatoPratica;
  tipoIntervento: string | null;
  createdAt: string;
  cliente: { id: string; ragioneSociale: string };
  operatore: { id: string; name: string };
  manutentore: { id: string; name: string } | null;
  cat: { id: string; ragioneSociale: string } | null;
}

interface Cat {
  id: string;
  ragioneSociale: string;
}

export default function PratichePage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>}>
      <PraticheContent />
    </Suspense>
  );
}

function PraticheContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pratiche, setPratiche] = useState<Pratica[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [catList, setCatList] = useState<Cat[]>([]);

  const [catDialog, setCatDialog] = useState<{ open: boolean; pratica: Pratica | null }>({ open: false, pratica: null });
  const [statoDialog, setStatoDialog] = useState<{ open: boolean; pratica: Pratica | null }>({ open: false, pratica: null });
  const [selectedCatId, setSelectedCatId] = useState("");
  const [newStato, setNewStato] = useState<StatoPratica | "">("");
  const [statoNote, setStatoNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const stato = searchParams.get("stato") ?? "";
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const canManage = canManageStati(session);
  const canManageCat = canManage && !session?.user?.catId;

  const fetchPratiche = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stato) params.set("stato", stato);
    if (search) params.set("search", search);
    params.set("page", String(page));
    const res = await fetch(`/api/pratiche?${params}`);
    const data = await res.json();
    setPratiche(data.pratiche ?? []);
    setTotal(data.total ?? 0);
    setTotalPages(data.totalPages ?? 1);
    setLoading(false);
  }, [stato, search, page]);

  useEffect(() => {
    fetchPratiche();
  }, [fetchPratiche]);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/cat?list=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; ragioneSociale: string }[]) =>
        setCatList(Array.isArray(data) ? data : [])
      );
  }, [canManage]);

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    // Cambiando un filtro si torna alla prima pagina; la paginazione invece
    // deve poter aggiornare direttamente il parametro "page".
    if (key !== "page") p.delete("page");
    router.push(`/pratiche?${p}`);
  }

  // Include il CAT eventualmente assegnato ma non più attivo, così il select
  // mostra sempre la ragione sociale invece del suo id.
  const catOptions = useMemo(() => {
    const map = new Map(catList.map((c) => [c.id, c]));
    const assegnato = catDialog.pratica?.cat;
    if (assegnato && !map.has(assegnato.id)) {
      map.set(assegnato.id, { id: assegnato.id, ragioneSociale: assegnato.ragioneSociale });
    }
    return [...map.values()].sort((a, b) =>
      a.ragioneSociale.localeCompare(b.ragioneSociale, "it")
    );
  }, [catList, catDialog.pratica]);

  const selectedCatLabel =
    selectedCatId === "none" || !selectedCatId
      ? undefined
      : catOptions.find((c) => c.id === selectedCatId)?.ragioneSociale;

  function openCatDialog(pratica: Pratica, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedCatId(pratica.cat?.id ?? "none");
    setCatDialog({ open: true, pratica });
  }

  function openStatoDialog(pratica: Pratica, e: React.MouseEvent) {
    e.stopPropagation();
    setNewStato("");
    setStatoNote("");
    setStatoDialog({ open: true, pratica });
  }

  async function assegnaCat() {
    if (!catDialog.pratica) return;
    setActionLoading(true);
    const catId = selectedCatId === "none" ? null : selectedCatId;
    const res = await fetch(`/api/pratiche/${catDialog.pratica.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catId }),
    });
    setActionLoading(false);
    if (!res.ok) {
      toast.error("Errore assegnazione CAT");
      return;
    }
    toast.success(catId ? "CAT assegnato" : "CAT rimosso");
    setCatDialog({ open: false, pratica: null });
    fetchPratiche();
  }

  async function assegnaStato() {
    if (!statoDialog.pratica || !newStato) return;
    setActionLoading(true);
    const res = await fetch(`/api/pratiche/${statoDialog.pratica.id}/stato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: newStato, note: statoNote || undefined }),
    });
    setActionLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Errore aggiornamento stato");
      return;
    }
    toast.success("Stato aggiornato");
    setStatoDialog({ open: false, pratica: null });
    fetchPratiche();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pratiche</h1>
          <p className="text-sm text-gray-500 mt-1">{total} pratiche trovate</p>
        </div>
        {canManageCat && (
          <Link href="/pratiche/nuova">
            <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" /> Nuova pratica
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca per numero, cliente..."
            className="pl-9"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <Select value={stato || "all"} onValueChange={(v) => setParam("stato", v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATI_ORDINE.map((s) => (
              <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : pratiche.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">Nessuna pratica trovata</div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">N° Pratica</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Operatore</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CAT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                {canManage && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Azioni</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pratiche.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/pratiche/${p.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-orange-600">{p.numeroPratica}</td>
                  <td className="px-4 py-3 text-gray-900">{p.cliente.ragioneSociale}</td>
                  <td className="px-4 py-3"><StatoBadge stato={p.stato} /></td>
                  <td className="px-4 py-3 text-gray-600">{p.operatore.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.cat?.ragioneSociale ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString("it-IT")}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {canManageCat && (
                          <Button variant="outline" size="sm" onClick={(e) => openCatDialog(p, e)}>
                            <Building2 className="h-3.5 w-3.5 mr-1" />
                            Assegna CAT
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={(e) => openStatoDialog(p, e)}>
                          <Tag className="h-3.5 w-3.5 mr-1" />
                          Assegna stato
                        </Button>
                      </div>
                    </td>
                  )}
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
            onClick={() => setParam("page", String(page - 1))}
          >
            Precedente
          </Button>
          <span className="text-sm text-gray-500">Pagina {page} di {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
          >
            Successiva
          </Button>
        </div>
      )}

      <Dialog open={catDialog.open} onOpenChange={(open) => setCatDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assegna CAT</DialogTitle>
          </DialogHeader>
          {catDialog.pratica && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Pratica <span className="font-mono font-medium text-gray-900">{catDialog.pratica.numeroPratica}</span>
              </p>
              <div className="space-y-1">
                <Label>Centro Assistenza</Label>
                <Select value={selectedCatId} onValueChange={(v) => setSelectedCatId(v ?? "none")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona CAT...">
                      {selectedCatLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun CAT</SelectItem>
                    {catOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.ragioneSociale}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCatDialog({ open: false, pratica: null })}>Annulla</Button>
                <Button className="bg-orange-500 hover:bg-orange-600" onClick={assegnaCat} disabled={actionLoading}>
                  {actionLoading ? "Salvataggio..." : "Conferma"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={statoDialog.open} onOpenChange={(open) => setStatoDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assegna stato</DialogTitle>
          </DialogHeader>
          {statoDialog.pratica && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Pratica <span className="font-mono font-medium text-gray-900">{statoDialog.pratica.numeroPratica}</span>
                {" · "}Stato attuale: <StatoBadge stato={statoDialog.pratica.stato} />
              </p>
              <div className="space-y-1">
                <Label>Nuovo stato</Label>
                <Select value={newStato || "none"} onValueChange={(v) => setNewStato(v === "none" ? "" : (v as StatoPratica))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona stato..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Seleziona stato...</SelectItem>
                    {statoDialog.pratica &&
                      statiTargetDisponibili(
                        session?.user?.role,
                        session?.user?.catId,
                        statoDialog.pratica.stato
                      ).map((s) => (
                        <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Note (opzionale)</Label>
                <Textarea
                  rows={2}
                  placeholder="Aggiungi una nota..."
                  value={statoNote}
                  onChange={(e) => setStatoNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStatoDialog({ open: false, pratica: null })}>Annulla</Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={assegnaStato}
                  disabled={!newStato || actionLoading}
                >
                  {actionLoading ? "Salvataggio..." : "Conferma"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
