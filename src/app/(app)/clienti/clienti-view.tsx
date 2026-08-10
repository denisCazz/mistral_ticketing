"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Search, Phone, MapPin, Pencil, Plus } from "lucide-react";
import {
  ClienteFormDialog,
  type ClienteForForm,
} from "@/components/clienti/cliente-form-dialog";
import { cn } from "@/lib/utils";

export type ClienteListItem = ClienteForForm & {
  _count: { preventivi: number };
};

export function ClientiView({
  clienti,
  total,
  totalPages,
  page,
  search,
}: {
  clienti: ClienteListItem[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteForForm | null>(null);

  function doSearch() {
    const p = new URLSearchParams();
    if (searchInput) p.set("search", searchInput);
    router.push(`/clienti?${p}`);
  }

  function pageHref(nextPage: number) {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    p.set("page", String(nextPage));
    return `/clienti?${p}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienti</h1>
          <p className="text-sm text-gray-500 mt-1">{total} clienti in anagrafica</p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" aria-hidden /> Nuovo cliente
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
          <Input
            placeholder="Cerca per nome, telefono, città, email..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button variant="outline" onClick={doSearch}>
          Cerca
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {clienti.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">
            Nessun cliente trovato
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Ragione sociale
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Città
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Telefono
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Pratiche
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Azioni
                </th>
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
                    {c.email && (
                      <p className="text-xs text-gray-500">{c.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.citta && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-400" aria-hidden />
                        {c.citta}
                        {c.provincia ? ` (${c.provincia})` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.cellulare && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-gray-400" aria-hidden />
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                        setDialogOpen(true);
                      }}
                      aria-label={`Modifica ${c.ragioneSociale}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
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
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              Precedente
            </Button>
          ) : (
            <Link
              href={pageHref(page - 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Precedente
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Pagina {page} di {totalPages}
          </span>
          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              Successiva
            </Button>
          ) : (
            <Link
              href={pageHref(page + 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Successiva
            </Link>
          )}
        </div>
      )}

      <ClienteFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        cliente={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
