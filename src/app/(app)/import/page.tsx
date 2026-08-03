"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  PlusCircle,
} from "lucide-react";

interface ImportResult {
  created: number;
  updated: number;
  ok: number;
  ko: number;
  errori: number;
  duplicati: number;
  duplicatiRecords: number;
  motiviKo: string[];
  erroriDettaglio: string[];
  headers: string[];
  stats: {
    totalRows: number;
    skippedSintesi: number;
    skippedRivedere: number;
  };
  fileName: string;
}

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport(file: File) {
    setLoading(true);
    setResult(null);
    const toastId = toast.loading(`Importazione di ${file.name} in corso...`);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Errore durante l'importazione", { id: toastId });
        return;
      }

      setResult(data);

      if (data.ok === 0 && data.ko === 0 && data.duplicati === 0) {
        toast.warning("Nessun record importato dal file", { id: toastId });
      } else {
        toast.success(
          `${data.created} nuovi, ${data.updated} aggiornati, ${data.ko} scartati`,
          { id: toastId }
        );
      }
    } catch {
      toast.error("Errore di rete durante l'importazione", { id: toastId });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runImport(file);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-orange-500" />
          Importazione clienti XLSX
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Carica il file Excel: l&apos;import parte subito e aggiorna i clienti esistenti
          (upsert per ID, email, telefono o nome+città).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Carica file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              loading
                ? "border-orange-300 bg-orange-50 cursor-wait"
                : "border-gray-300 hover:border-orange-400 cursor-pointer"
            }`}
            onClick={() => !loading && inputRef.current?.click()}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
                <p className="font-medium text-orange-700">Importazione in corso...</p>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Clicca o trascina il file XLSX</p>
                <p className="text-xs text-gray-400 mt-1">
                  Fogli usati: Clienti, Duplicati_da_rivedere
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={loading}
              onChange={handleFileChange}
            />
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
            <p className="font-medium">Colonne riconosciute automaticamente:</p>
            <p>
              Nome/Cognome/Ragione sociale · Comune/Città · Provincia · Cellulare/Telefono ·
              Email · Indirizzo · CAP · Stato
            </p>
            <p className="pt-1">
              Record con <strong>#NOME?</strong> o nome mancante vengono scartati.
            </p>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Risultato — {result.fileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <PlusCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700">{result.created}</p>
                <p className="text-xs text-green-600">Nuovi</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <RefreshCw className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                <p className="text-xs text-blue-600">Aggiornati</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <XCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-600">{result.ko}</p>
                <p className="text-xs text-red-500">Scartati</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-yellow-700">{result.duplicati}</p>
                <p className="text-xs text-yellow-600">Gruppi duplicati</p>
              </div>
            </div>

            {result.headers.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Colonne lette dal foglio Clienti:</p>
                <p>{result.headers.join(" · ")}</p>
                <p className="mt-2 text-gray-500">
                  Righe totali: {result.stats.totalRows} · Saltate (riepilogo): {result.stats.skippedSintesi} ·
                  Da rivedere: {result.stats.skippedRivedere}
                </p>
              </div>
            )}

            {result.motiviKo.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Motivi scarto (primi 10):</p>
                <ul className="text-xs text-red-600 space-y-0.5">
                  {result.motiviKo.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.erroriDettaglio.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Errori salvataggio:</p>
                <ul className="text-xs text-red-600 space-y-0.5">
                  {result.erroriDettaglio.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.duplicati > 0 && (
              <Link href="/import/duplicati">
                <Button className="w-full bg-orange-500 hover:bg-orange-600">
                  Gestisci {result.duplicati} gruppi di duplicati →
                </Button>
              </Link>
            )}

            <div className="flex gap-2">
              <Link href="/clienti" className="flex-1">
                <Button variant="outline" className="w-full">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Vai ai clienti
                </Button>
              </Link>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setResult(null);
                  inputRef.current?.click();
                }}
              >
                Carica altro file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
