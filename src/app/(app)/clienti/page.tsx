"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Phone, MapPin, Pencil, Plus } from "lucide-react";
import { ClienteFormDialog } from "@/components/clienti/cliente-form-dialog";

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
  _count: { preventivi: number };
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
  const [refreshKey, setRefreshKey] = useState(0);

  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const queryKey = `${search}|${page}|${refreshKey}`;
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);
  if (prevQueryKey !== queryKey) {
    setPrevQueryKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    fetch(`/api/clienti?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setClienti(data.clienti ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, refreshKey]);

  function doSearch() {
    const p = new URLSearchParams();
    if (searchInput) p.set("search", searchInput);
    router.push(`/clienti?${p}`);
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(c: Cliente, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(c);
    setDialogOpen(true);
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
                      {c._count.preventivi} preventivi
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

      <ClienteFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        cliente={editing}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
