"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AziendaSettingsDTO, RapportinoDTO } from "@/types/rapportino";
import { downloadRapportinoPDF } from "@/lib/pdf-rapportino";
import {
  formatSiNoNc,
  formatTipologiaInstallazione,
  formatTipologiaIntervento,
} from "@/lib/rapportino-constants";
import { cn } from "@/lib/utils";

export default function RapportinoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<RapportinoDTO | null>(null);
  const [settings, setSettings] = useState<AziendaSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/rapportini/${id}`).then((r) => r.json()),
      fetch("/api/settings/azienda").then((r) => r.json()),
    ])
      .then(([rapportino, azienda]) => {
        if (rapportino.error) {
          toast.error(rapportino.error);
          return;
        }
        setItem(rapportino);
        setSettings(azienda);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function onDelete() {
    if (!confirm("Eliminare questo rapportino?")) return;
    const res = await fetch(`/api/rapportini/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Eliminazione non riuscita");
      return;
    }
    toast.success("Rapportino eliminato");
    router.push("/rapportini");
  }

  async function onPdf() {
    if (!item || !settings) return;
    try {
      await downloadRapportinoPDF(item, settings);
    } catch {
      toast.error("Errore generazione PDF");
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Rapportino non trovato.</p>
        <Link href="/rapportini" className={cn(buttonVariants({ variant: "outline" }), "mt-4 inline-flex")}>
          Torna all&apos;elenco
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    ["Cliente", item.cliente?.ragioneSociale || "—"],
    ["Data", item.dataIntervento + (item.oraIntervento ? ` · ${item.oraIntervento}` : "")],
    ["Operatore", item.utente?.name || "—"],
    ["Pratica", item.pratica?.numeroPratica || "—"],
    ["Tipologia", formatTipologiaIntervento(item.tipologiaIntervento)],
    ["Stufa", `${item.tipoStufa} · ${item.marca} ${item.modello}`],
    ["N° serie", item.numeroSerie || "—"],
    ["Tipo intervento", item.tipoIntervento],
    ["Motivo", item.motivoChiamata || "—"],
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {item.cliente?.ragioneSociale || "Rapportino"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {item.marca} {item.modello} · {item.dataIntervento}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/rapportini" className={cn(buttonVariants({ variant: "outline" }))}>
            Elenco
          </Link>
          <Button variant="outline" onClick={onPdf}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-2">
              <span className="text-gray-500">{k}</span>
              <span className="col-span-2 font-medium text-gray-900">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Descrizione</CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap text-gray-800">
          {item.descrizione}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controlli</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Manutenzione spiegata: {formatSiNoNc(item.spiegataManutenzione as never)}</p>
          <p>Impianto elettrico: {formatSiNoNc(item.impiantoElettrico as never)}</p>
          <p>Condotto fumi: {formatSiNoNc(item.condottoFumi as never)}</p>
          <p>UNI 10683: {formatSiNoNc(item.installazioneUni10683 as never)}</p>
          <p>Parametri: {formatSiNoNc(item.controlloParametri as never)}</p>
          <p>
            Installazione:{" "}
            {formatTipologiaInstallazione(item.tipologiaInstallazione as never)}
          </p>
        </CardContent>
      </Card>

      {(item.materialiUtilizzati || item.note) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Materiali e note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm whitespace-pre-wrap">
            {item.materialiUtilizzati && <p>{item.materialiUtilizzati}</p>}
            {item.note && <p className="text-gray-600">{item.note}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
