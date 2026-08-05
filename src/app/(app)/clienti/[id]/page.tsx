"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreventivoStatoBadge } from "@/components/preventivo-stato-badge";
import { StatoPreventivo } from "@prisma/client";
import {
  ArrowLeft,
  Phone,
  Smartphone,
  MapPin,
  Mail,
  FileText,
  Plus,
  Pencil,
  Navigation,
  StickyNote,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ClienteFormDialog } from "@/components/clienti/cliente-form-dialog";

interface ClienteDetail {
  id: string;
  ragioneSociale: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  telFisso: string | null;
  cellulare: string | null;
  email: string | null;
  note1: string | null;
  note2: string | null;
  note3: string | null;
  statoAnagrafica: string | null;
  motivoControllo: string | null;
  preventivi: {
    id: string;
    numeroPreventivo: string;
    stato: StatoPreventivo;
    totaleFinale: string | null;
    createdAt: string;
    operatore: { id: string; name: string };
  }[];
}

function telHref(tel: string) {
  return `tel:${tel.replace(/[^\d+]/g, "")}`;
}

function indirizzoCompleto(c: ClienteDetail) {
  return [
    c.indirizzo,
    [c.cap, c.citta].filter(Boolean).join(" "),
    c.provincia,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteDetail | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/clienti/${id}`)
      .then((r) => {
        if (!r.ok) {
          router.push("/clienti");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setCliente(d));
  }, [id, router]);

  if (!cliente) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  const indirizzo = indirizzoCompleto(cliente);
  const hasMap = Boolean(indirizzo);
  const mapsQuery = encodeURIComponent(indirizzo);
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${mapsQuery}&z=14&hl=it&output=embed`;
  const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;
  const hasNote = Boolean(cliente.note1 || cliente.note2 || cliente.note3);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/clienti">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {cliente.ragioneSociale}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {cliente.citta && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {cliente.citta}
                  {cliente.provincia ? ` (${cliente.provincia})` : ""}
                </span>
              )}
              {cliente.statoAnagrafica && <span>· {cliente.statoAnagrafica}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
          <Link href={`/preventivi/nuovo?clienteId=${cliente.id}`}>
            <Button className="w-full sm:w-auto bg-sky-700 hover:bg-sky-800">
              <Plus className="h-4 w-4 mr-2" /> Nuovo preventivo
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contatti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(cliente.cellulare || cliente.telFisso || cliente.email || hasMap) && (
                <div className="flex flex-wrap gap-2">
                  {(cliente.cellulare ?? cliente.telFisso) && (
                    <a
                      href={telHref(cliente.cellulare ?? cliente.telFisso ?? "")}
                      className={cn(
                        buttonVariants(),
                        "bg-orange-500 hover:bg-orange-600 text-white"
                      )}
                    >
                      <Phone className="h-4 w-4 mr-2" /> Chiama
                    </a>
                  )}
                  {cliente.email && (
                    <a
                      href={`mailto:${cliente.email}`}
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      <Mail className="h-4 w-4 mr-2" /> Scrivi email
                    </a>
                  )}
                  {hasMap && (
                    <a
                      href={mapsDirectionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      <Navigation className="h-4 w-4 mr-2" /> Indicazioni
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-3 text-sm">
                {cliente.cellulare && (
                  <a
                    href={telHref(cliente.cellulare)}
                    className="flex items-center gap-3 text-gray-700 hover:text-orange-600 transition-colors"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-500 shrink-0">
                      <Smartphone className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs text-gray-400">Cellulare</span>
                      <span className="font-medium">{cliente.cellulare}</span>
                    </span>
                  </a>
                )}
                {cliente.telFisso && (
                  <a
                    href={telHref(cliente.telFisso)}
                    className="flex items-center gap-3 text-gray-700 hover:text-orange-600 transition-colors"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-500 shrink-0">
                      <Phone className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs text-gray-400">Tel. fisso</span>
                      <span className="font-medium">{cliente.telFisso}</span>
                    </span>
                  </a>
                )}
                {cliente.email && (
                  <a
                    href={`mailto:${cliente.email}`}
                    className="flex items-center gap-3 text-gray-700 hover:text-orange-600 transition-colors"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-500 shrink-0">
                      <Mail className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-400">Email</span>
                      <span className="font-medium break-all">{cliente.email}</span>
                    </span>
                  </a>
                )}
                {indirizzo && (
                  <div className="flex items-center gap-3 text-gray-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-500 shrink-0">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs text-gray-400">Indirizzo</span>
                      <span className="font-medium">{indirizzo}</span>
                    </span>
                  </div>
                )}
                {!cliente.cellulare && !cliente.telFisso && !cliente.email && !indirizzo && (
                  <p className="text-sm text-gray-500 py-2 text-center">
                    Nessun recapito in anagrafica
                  </p>
                )}
              </div>

              {(hasNote || cliente.motivoControllo) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    {cliente.note1 && <Nota label="Note 1" testo={cliente.note1} />}
                    {cliente.note2 && <Nota label="Note 2" testo={cliente.note2} />}
                    {cliente.note3 && <Nota label="Note 3" testo={cliente.note3} />}
                    {cliente.motivoControllo && (
                      <Nota label="Motivo controllo" testo={cliente.motivoControllo} />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Mappa
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-64px)]">
              {hasMap ? (
                <div className="h-full min-h-[340px] rounded-lg overflow-hidden border border-gray-200">
                  <iframe
                    src={mapsEmbedUrl}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Mappa sede di ${cliente.ragioneSociale}`}
                  />
                </div>
              ) : (
                <div className="h-full min-h-[340px] flex items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500">
                  Indirizzo non disponibile: impossibile mostrare la mappa
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Preventivi ({cliente.preventivi.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cliente.preventivi.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              Nessun preventivo per questo cliente
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {cliente.preventivi.map((p) => (
                <Link
                  key={p.id}
                  href={`/preventivi/${p.id}`}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium font-mono text-sky-700">
                      {p.numeroPreventivo}
                    </p>
                    <p className="text-xs text-gray-500">{p.operatore.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <PreventivoStatoBadge stato={p.stato} />
                    <span className="text-xs text-gray-400">
                      € {Number(p.totaleFinale ?? 0).toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ClienteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cliente={cliente}
        onSaved={() =>
          fetch(`/api/clienti/${cliente.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setCliente(d))
        }
      />
    </div>
  );
}

function Nota({ label, testo }: { label: string; testo: string }) {
  return (
    <div className="flex items-start gap-2">
      <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
      <p className="text-xs text-gray-600">
        <span className="font-medium">{label}:</span> {testo}
      </p>
    </div>
  );
}
