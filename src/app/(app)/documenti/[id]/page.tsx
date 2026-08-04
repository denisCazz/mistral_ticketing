"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DocumentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [dataScadenza, setDataScadenza] = useState("");

  useEffect(() => {
    fetch(`/api/documenti/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDoc(d.documento);
        setDownloadUrl(d.downloadUrl);
        if (d.documento?.dataScadenza) {
          setDataScadenza(d.documento.dataScadenza.slice(0, 10));
        }
      });
  }, [id]);

  async function confermaScadenza() {
    const res = await fetch(`/api/documenti/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataScadenza,
        statoValidita: "VALIDO",
        aiWhitelist: doc?.aiWhitelist,
      }),
    });
    if (!res.ok) {
      toast.error("Errore aggiornamento");
      return;
    }
    toast.success("Scadenza confermata");
  }

  if (!doc) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href="/documenti" className="text-sm text-sky-700">← Documenti</Link>
      <h1 className="text-2xl font-bold">{String(doc.titoloOriginale)}</h1>
      <div className="text-sm text-gray-600 space-y-1">
        <p>Categoria: {String(doc.categoria)}</p>
        <p>Stato: {String(doc.statoValidita)}</p>
        <p>Ingestione: {String(doc.statoIngestione)}</p>
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noreferrer" className="text-sky-700">
            Scarica file
          </a>
        )}
      </div>

      <div className="space-y-2 border p-4 rounded-lg">
        <Label>Conferma scadenza</Label>
        <Input type="date" value={dataScadenza} onChange={(e) => setDataScadenza(e.target.value)} />
        <Button onClick={confermaScadenza}>Salva scadenza</Button>
      </div>
    </div>
  );
}
