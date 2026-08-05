"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Download,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentPreview } from "@/components/document-preview";
import { cn } from "@/lib/utils";
import { invalidateDocumentiCache } from "@/lib/documenti-cache";

type Dipendente = { id: string; nome: string; cognome: string };
type Automezzo = { id: string; targa: string; descrizione?: string | null };
type Scadenza = {
  id: string;
  dataScadenza: string;
  confermata?: boolean;
  fonte?: string;
};

type DocumentoDetail = {
  id: string;
  titoloOriginale: string;
  categoria: string;
  sottocategoria?: string | null;
  entityType: string;
  mimeType: string;
  sizeBytes: number;
  dataScadenza: string | null;
  statoValidita: string;
  statoIngestione: string;
  aiWhitelist: boolean;
  sourcePath?: string | null;
  createdAt?: string;
  extractedText?: string | null;
  dipendente?: Dipendente | null;
  automezzo?: Automezzo | null;
  scadenze?: Scadenza[];
};

function statusStyle(status: string): string {
  if (status === "VALIDO") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "SCADUTO") return "bg-red-50 text-red-700 ring-red-600/20";
  if (status === "ARCHIVIATO") return "bg-gray-100 text-gray-600 ring-gray-500/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function DocumentoDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [doc, setDoc] = useState<DocumentoDetail | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [dataScadenza, setDataScadenza] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const backHref = useMemo(() => {
    const ret = searchParams.get("return");
    if (!ret) return "/documenti";
    try {
      return `/documenti?${decodeURIComponent(ret)}`;
    } catch {
      return "/documenti";
    }
  }, [searchParams]);

  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documenti/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDoc(d.documento ?? null);
        setDownloadUrl(d.downloadUrl ?? null);
        if (d.documento?.dataScadenza) {
          setDataScadenza(String(d.documento.dataScadenza).slice(0, 10));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function confermaScadenza() {
    if (!doc) return;
    setSaving(true);
    const res = await fetch(`/api/documenti/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataScadenza: dataScadenza || null,
        statoValidita: dataScadenza ? "VALIDO" : doc.statoValidita,
        aiWhitelist: doc.aiWhitelist,
        scadenzaSource: "MANUALE",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Errore aggiornamento");
      return;
    }
    const updated = await res.json();
    setDoc((current) =>
      current
        ? {
            ...current,
            dataScadenza: updated.dataScadenza,
            statoValidita: updated.statoValidita,
          }
        : current
    );
    invalidateDocumentiCache();
    toast.success("Scadenza salvata");
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Torna ai documenti
        </Link>
        <p className="font-medium">Documento non trovato</p>
      </div>
    );
  }

  const isPdf =
    doc.mimeType.includes("pdf") ||
    doc.titoloOriginale.toLowerCase().endsWith(".pdf");
  const entityLabel = doc.dipendente
    ? `${doc.dipendente.cognome} ${doc.dipendente.nome}`
    : doc.automezzo
      ? doc.automezzo.targa
      : doc.entityType === "AZIENDA"
        ? "Azienda"
        : doc.entityType;
  const previewUrl = `/api/documenti/${doc.id}/file`;
  const openUrl = downloadUrl ?? previewUrl;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alla categoria
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight break-words">
              {doc.titoloOriginale}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  statusStyle(doc.statoValidita)
                )}
              >
                {doc.statoValidita.replaceAll("_", " ")}
              </span>
              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {doc.categoria}
              </span>
              {doc.aiWhitelist && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Disponibile per AI
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Apri
          </a>
          <a
            href={downloadUrl ?? previewUrl}
            download={doc.titoloOriginale}
            className={cn(buttonVariants())}
          >
            <Download className="mr-2 h-4 w-4" />
            Scarica
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <DocumentPreview
          documentoId={doc.id}
          titolo={doc.titoloOriginale}
          mimeType={doc.mimeType}
          sizeBytes={doc.sizeBytes}
          extractedText={doc.extractedText}
        />

        <aside className="space-y-4">
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Dettagli</h2>
            <dl className="space-y-2.5">
              <MetaRow label="Archivio" value={entityLabel} />
              <MetaRow label="Categoria" value={doc.categoria} />
              <MetaRow label="Sottocategoria" value={doc.sottocategoria} />
              <MetaRow
                label="Tipo"
                value={isPdf ? "PDF" : doc.mimeType || "—"}
              />
              <MetaRow
                label="Scadenza"
                value={
                  doc.dataScadenza
                    ? new Date(doc.dataScadenza).toLocaleDateString("it-IT")
                    : "Non impostata"
                }
              />
              <MetaRow
                label="Ingestione"
                value={String(doc.statoIngestione).replaceAll("_", " ")}
              />
              <MetaRow label="Percorso" value={doc.sourcePath} />
              <MetaRow
                label="Caricato"
                value={
                  doc.createdAt
                    ? new Date(doc.createdAt).toLocaleString("it-IT")
                    : null
                }
              />
            </dl>
          </section>

          {isAdmin && (
            <section className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-sky-700" />
                <h2 className="font-semibold">Conferma scadenza</h2>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="data-scadenza">Data scadenza</Label>
                  <Input
                    id="data-scadenza"
                    type="date"
                    value={dataScadenza}
                    onChange={(e) => setDataScadenza(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={saving}
                  onClick={confermaScadenza}
                >
                  {saving ? "Salvataggio…" : "Salva scadenza"}
                </Button>
              </div>
            </section>
          )}

          {doc.scadenze && doc.scadenze.length > 0 && (
            <section className="rounded-xl border bg-white p-4">
              <h2 className="mb-3 font-semibold">Scadenze collegate</h2>
              <ul className="space-y-2">
                {doc.scadenze.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {new Date(item.dataScadenza).toLocaleDateString("it-IT")}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.fonte ?? "—"}
                      {item.confermata ? " · confermata" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function DocumentoDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
        </div>
      }
    >
      <DocumentoDetailContent />
    </Suspense>
  );
}
