"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Flashlight, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NATIVE_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
] as const;

type ScanEngine = "native" | "zxing" | "none";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  }
}

export interface BarcodeScannerProps {
  onScan: (code: string, formatHint?: string) => void;
  paused?: boolean;
  className?: string;
}

async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state;
  } catch {
    // Safari e alcuni browser non supportano la query per la fotocamera
    return "unknown";
  }
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Permesso fotocamera negato nelle impostazioni del browser. Attivalo per questo sito e premi Riprova.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nessuna fotocamera trovata. Usa l'inserimento manuale.";
    case "NotReadableError":
    case "TrackStartError":
      return "Fotocamera occupata da un'altra app. Chiudila e premi Riprova.";
    case "SecurityError":
      return "Accesso alla fotocamera bloccato: il sito deve essere aperto in HTTPS (o localhost).";
    default:
      return "Impossibile accedere alla fotocamera. Usa l'inserimento manuale.";
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close(), 200);
  } catch {
    /* ignore */
  }
}

function vibrate() {
  try {
    navigator.vibrate?.(80);
  } catch {
    /* ignore */
  }
}

async function detectEngine(): Promise<ScanEngine> {
  if (typeof window === "undefined") return "none";
  if ("BarcodeDetector" in window && typeof window.BarcodeDetector === "function") {
    try {
      const supported =
        "getSupportedFormats" in window.BarcodeDetector
          ? await (
              window.BarcodeDetector as unknown as {
                getSupportedFormats: () => Promise<string[]>;
              }
            ).getSupportedFormats()
          : [...NATIVE_FORMATS];
      const needed = ["qr_code", "ean_13"];
      if (needed.every((f) => supported.includes(f))) return "native";
    } catch {
      /* fall through */
    }
  }
  return "zxing";
}

export function BarcodeScanner({ onScan, paused = false, className }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef<number>(0);
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [engine, setEngine] = useState<ScanEngine>("none");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"permission" | "camera" | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [ready, setReady] = useState(false);

  const emit = useCallback((code: string) => {
    if (pausedRef.current) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    const now = Date.now();
    // Cooldown anti-doppio scan
    if (trimmed === lastCodeRef.current && now - lastAtRef.current < 2000) return;
    lastCodeRef.current = trimmed;
    lastAtRef.current = now;
    beep();
    vibrate();
    onScanRef.current(trimmed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      setError(null);
      setErrorKind(null);
      setReady(false);

      // Se il permesso è già negato, non ripresentare il prompt: guida l'utente.
      const perm = await queryCameraPermission();
      if (cancelled) return;
      if (perm === "denied") {
        setErrorKind("permission");
        setError(
          "Permesso fotocamera negato. Attivalo nelle impostazioni del browser/app per questo sito e premi Riprova."
        );
        setManualOpen(true);
        return;
      }

      const chosen = await detectEngine();
      if (cancelled) return;
      setEngine(chosen);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(caps?.torch));

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        if (chosen === "native" && window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({
            formats: [...NATIVE_FORMATS],
          });

          const loop = async () => {
            if (cancelled) return;
            if (!pausedRef.current && video.readyState >= 2) {
              try {
                const codes = await detector.detect(video);
                if (codes[0]?.rawValue) emit(codes[0].rawValue);
              } catch {
                /* frame skip */
              }
            }
            rafRef.current = requestAnimationFrame(() => {
              void loop();
            });
          };
          void loop();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 120,
          });

          zxingControls = await reader.decodeFromStream(
            stream,
            video,
            (result) => {
              if (cancelled || pausedRef.current) return;
              if (result) emit(result.getText());
            }
          );
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        const isPermission =
          name === "NotAllowedError" || name === "PermissionDeniedError";
        setErrorKind(isPermission ? "permission" : "camera");
        setError(
          isPermission
            ? "Permesso fotocamera negato. Attivalo nelle impostazioni del browser/app per questo sito e premi Riprova."
            : cameraErrorMessage(err)
        );
        setManualOpen(true);
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [emit, retryKey]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        // @ts-expect-error torch is non-standard but widely supported on Android
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn((v) => !v);
    } catch {
      setTorchSupported(false);
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    emit(manualCode);
    setManualCode("");
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black", className)}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Viewfinder */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-44 w-[78%] max-w-sm border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-sky-400/80 animate-pulse" />
        </div>
      </div>

      <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white/90">
        {engine === "native"
          ? "Scanner nativo · QR + EAN"
          : engine === "zxing"
            ? "Scanner ZXing · QR + EAN"
            : "Avvio scanner…"}
        {paused ? " · in pausa" : ""}
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2">
        {torchSupported && (
          <Button
            type="button"
            size="sm"
            variant={torchOn ? "default" : "secondary"}
            className="bg-white/90 text-gray-900 hover:bg-white"
            onClick={() => void toggleTorch()}
          >
            <Flashlight className="h-4 w-4 mr-1" />
            Torcia
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-white/90 text-gray-900 hover:bg-white"
          onClick={() => setManualOpen((v) => !v)}
        >
          <Keyboard className="h-4 w-4 mr-1" />
          Manuale
        </Button>
      </div>

      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
          Avvio fotocamera…
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 top-12 mx-3 flex flex-col gap-2 rounded-lg bg-red-600/90 p-3 text-sm text-white">
          <div className="flex items-start gap-2">
            <CameraOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-white text-red-700 hover:bg-red-50"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Riprova
            </Button>
            {errorKind === "permission" && (
              <span className="self-center text-xs text-white/85">
                Chrome Android: lucchetto accanto all&apos;indirizzo → Fotocamera.
                iPhone: Impostazioni → Safari → Fotocamera.
              </span>
            )}
          </div>
        </div>
      )}

      {manualOpen && (
        <form
          onSubmit={submitManual}
          className="absolute inset-x-3 bottom-14 flex gap-2 rounded-lg bg-white/95 p-2 shadow-lg"
        >
          <Input
            autoFocus
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Inserisci QR / EAN…"
            className="bg-white"
          />
          <Button type="submit" className="bg-sky-700 hover:bg-sky-800 shrink-0">
            Vai
          </Button>
        </form>
      )}
    </div>
  );
}
