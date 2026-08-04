"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Maximize2,
  Minimize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewKind = "pdf" | "image" | "text-file" | "extracted" | "none";

function detectKind(mimeType: string, filename: string, hasExtracted: boolean): PreviewKind {
  const mime = (mimeType || "").toLowerCase();
  const name = filename.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|bmp|heic|tiff?)$/i.test(name)
  ) {
    return "image";
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("csv") ||
    /\.(txt|csv|md|log|json)$/i.test(name)
  ) {
    return "text-file";
  }
  if (hasExtracted) return "extracted";
  return "none";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentPreview({
  documentoId,
  titolo,
  mimeType,
  sizeBytes,
  extractedText,
}: {
  documentoId: string;
  titolo: string;
  mimeType: string;
  sizeBytes: number;
  extractedText?: string | null;
}) {
  const fileUrl = `/api/documenti/${documentoId}/file`;
  const hasExtracted = Boolean(extractedText?.trim());
  const kind = detectKind(mimeType, titolo, hasExtracted);

  const [tab, setTab] = useState<"file" | "testo">(
    kind === "extracted" || kind === "none" ? "testo" : "file"
  );
  const [loading, setLoading] = useState(kind === "pdf" || kind === "image" || kind === "text-file");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);

  const showFileTab = kind === "pdf" || kind === "image" || kind === "text-file";
  const showTextTab = hasExtracted || kind === "text-file";

  useEffect(() => {
    setTab(showFileTab ? "file" : "testo");
    setZoom(1);
    setRotation(0);
    setError(null);
    setLoading(kind === "pdf" || kind === "image" || kind === "text-file");
    setTextContent(null);
  }, [documentoId, kind, showFileTab]);

  useEffect(() => {
    if (kind !== "text-file" || tab !== "file") return;
    let cancelled = false;
    setLoading(true);
    fetch(fileUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error("Lettura file fallita");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setTextContent(text);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Impossibile caricare il testo del file");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, tab, fileUrl]);

  const previewLabel = useMemo(() => {
    if (kind === "pdf") return "PDF";
    if (kind === "image") return "Immagine";
    if (kind === "text-file") return "Testo";
    if (hasExtracted) return "Testo estratto";
    return mimeType || "file";
  }, [kind, hasExtracted, mimeType]);

  const shellClass = cn(
    "overflow-hidden rounded-xl border bg-white",
    fullscreen && "fixed inset-3 z-50 flex flex-col shadow-2xl sm:inset-6"
  );

  return (
    <section className={shellClass}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Anteprima</p>
          <p className="truncate text-xs text-gray-500">
            {previewLabel} · {formatSize(sizeBytes)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {showFileTab && showTextTab && (
            <div className="mr-1 inline-flex rounded-lg border bg-gray-50 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  tab === "file" ? "bg-white text-sky-800 shadow-sm" : "text-gray-600"
                )}
                onClick={() => setTab("file")}
              >
                File
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  tab === "testo" ? "bg-white text-sky-800 shadow-sm" : "text-gray-600"
                )}
                onClick={() => setTab("testo")}
              >
                Testo
              </button>
            </div>
          )}

          {tab === "file" && kind === "image" && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom indietro"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              >
                <ZoomOut />
              </Button>
              <span className="min-w-10 text-center text-xs tabular-nums text-gray-500">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom avanti"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
              >
                <ZoomIn />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ruota"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw />
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={fullscreen ? "Esci da schermo intero" : "Schermo intero"}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "relative bg-[#f3f4f6]",
          fullscreen ? "min-h-0 flex-1" : "min-h-[min(72vh,820px)]"
        )}
      >
        {tab === "testo" ? (
          hasExtracted ? (
            <div className={cn("overflow-auto p-4", fullscreen ? "h-full" : "max-h-[72vh]")}>
              <pre className="whitespace-pre-wrap break-words rounded-lg border bg-white p-4 text-sm leading-relaxed text-gray-800">
                {extractedText}
              </pre>
            </div>
          ) : (
            <EmptyPreview message="Nessun testo estratto per questo documento." />
          )
        ) : error ? (
          <EmptyPreview message={error} />
        ) : kind === "pdf" ? (
          <>
            {loading && <LoadingOverlay />}
            <iframe
              title={titolo}
              src={`${fileUrl}#toolbar=1&navpanes=0`}
              className={cn(
                "w-full bg-white",
                fullscreen ? "h-full" : "h-[min(72vh,820px)]",
                loading && "opacity-0"
              )}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError("Anteprima PDF non disponibile. Usa Apri o Scarica.");
              }}
            />
          </>
        ) : kind === "image" ? (
          <div
            className={cn(
              "flex items-center justify-center overflow-auto p-4",
              fullscreen ? "h-full" : "h-[min(72vh,820px)]"
            )}
          >
            {loading && <LoadingOverlay />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl}
              alt={titolo}
              className={cn(
                "max-w-full origin-center rounded-md shadow-sm transition-transform duration-200",
                loading && "opacity-0"
              )}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                maxHeight: fullscreen ? "100%" : "min(72vh, 820px)",
              }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError("Immagine non caricabile.");
              }}
            />
          </div>
        ) : kind === "text-file" ? (
          loading ? (
            <LoadingOverlay />
          ) : (
            <div className={cn("overflow-auto p-4", fullscreen ? "h-full" : "max-h-[72vh]")}>
              <pre className="whitespace-pre-wrap break-words rounded-lg border bg-white p-4 text-sm leading-relaxed text-gray-800">
                {textContent}
              </pre>
            </div>
          )
        ) : hasExtracted ? (
          <div className={cn("overflow-auto p-4", fullscreen ? "h-full" : "max-h-[72vh]")}>
            <pre className="whitespace-pre-wrap break-words rounded-lg border bg-white p-4 text-sm leading-relaxed text-gray-800">
              {extractedText}
            </pre>
          </div>
        ) : (
          <EmptyPreview message="Questo formato non si può visualizzare qui. Usa Apri o Scarica." />
        )}
      </div>
    </section>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f3f4f6]/80">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
    </div>
  );
}

function EmptyPreview({ message }: { message: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="rounded-full bg-white p-3 shadow-sm">
        <FileText className="h-7 w-7 text-sky-700" />
      </span>
      <p className="max-w-sm text-sm text-gray-600">{message}</p>
    </div>
  );
}
