"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatoBadge } from "@/components/stato-badge";
import { StatoPratica } from "@prisma/client";
import { ArrowLeft, Phone, MapPin, Mail, FileText, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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
  pratiche: {
    id: string;
    numeroPratica: string;
    stato: StatoPratica;
    tipoIntervento: string | null;
    createdAt: string;
    operatore: { id: string; name: string };
  }[];
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteDetail | null>(null);

  useEffect(() => {
    fetch(`/api/clienti/${id}`)
      .then((r) => {
        if (!r.ok) { router.push("/clienti"); return null; }
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/clienti">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{cliente.ragioneSociale}</h1>
            {cliente.statoAnagrafica && (
              <p className="text-sm text-gray-500 mt-1">Stato anagrafica: {cliente.statoAnagrafica}</p>
            )}
          </div>
        </div>
        <Link href={`/pratiche/nuova?clienteId=${cliente.id}`} className="shrink-0">
          <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 mr-2" /> Nuova pratica
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Anagrafica */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Anagrafica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {cliente.indirizzo && (
                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
                  <div>
                    <p>{cliente.indirizzo}</p>
                    <p>{cliente.cap} {cliente.citta}{cliente.provincia ? ` (${cliente.provincia})` : ""}</p>
                  </div>
                </div>
              )}
              {cliente.cellulare && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{cliente.cellulare}</span>
                </div>
              )}
              {cliente.telFisso && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{cliente.telFisso} (fisso)</span>
                </div>
              )}
              {cliente.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{cliente.email}</span>
                </div>
              )}

              {(cliente.note1 || cliente.note2 || cliente.note3) && (
                <>
                  <Separator />
                  {cliente.note1 && <p className="text-xs text-gray-600"><span className="font-medium">Note 1:</span> {cliente.note1}</p>}
                  {cliente.note2 && <p className="text-xs text-gray-600"><span className="font-medium">Note 2:</span> {cliente.note2}</p>}
                  {cliente.note3 && <p className="text-xs text-gray-600"><span className="font-medium">Note 3:</span> {cliente.note3}</p>}
                </>
              )}

              {cliente.motivoControllo && (
                <>
                  <Separator />
                  <p className="text-xs text-gray-600"><span className="font-medium">Motivo controllo:</span> {cliente.motivoControllo}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pratiche */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Pratiche ({cliente.pratiche.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cliente.pratiche.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Nessuna pratica per questo cliente</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cliente.pratiche.map((p) => (
                    <Link
                      key={p.id}
                      href={`/pratiche/${p.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium font-mono text-orange-600">{p.numeroPratica}</p>
                        <p className="text-xs text-gray-500">
                          {p.tipoIntervento ?? "—"} · {p.operatore.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatoBadge stato={p.stato} />
                        <span className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString("it-IT")}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
