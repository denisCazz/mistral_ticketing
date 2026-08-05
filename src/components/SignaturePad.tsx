'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface SignaturePadProps {
  label: string;
  value?: string;
  required?: boolean;
  onChange: (value: string) => void;
  /** Messaggio sotto l'anteprima (es. firma caricata dal profilo) */
  helperText?: string;
}

export default function SignaturePad({
  label,
  value,
  required = false,
  onChange,
  helperText,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<string>('');
  const historyRef = useRef<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [historyLen, setHistoryLen] = useState(0);

  const initCanvas = useCallback((img?: string) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineWidth = window.innerWidth < 640 ? 3 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const isDark = document.documentElement.classList.contains('dark');
    const strokeColor = isDark ? '#ffffff' : '#1e293b';
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.clearRect(0, 0, w, h);

    const src = img ?? draftRef.current ?? value;
    if (src) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, w, h);
      image.src = src;
    }
  }, [value]);

  // Open: lock body scroll, init canvas after layout
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => initCanvas());
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = '';
    };
  }, [isOpen, initCanvas]);

  const openPad = () => {
    draftRef.current = value || '';
    historyRef.current = [];
    setHistoryLen(0);
    setHasStrokes(!!value);
    setIsOpen(true);
  };

  // Resize handler
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      if (isDrawingRef.current) return;
      const c = canvasRef.current;
      if (c && c.width > 0 && c.height > 0) {
        try { draftRef.current = c.toDataURL('image/png'); } catch { /* noop */ }
      }
      requestAnimationFrame(() => initCanvas(draftRef.current));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [isOpen, initCanvas]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save snapshot for undo
    if (canvas.width > 0 && canvas.height > 0) {
      try {
        historyRef.current = [...historyRef.current.slice(-19), canvas.toDataURL('image/png')];
        setHistoryLen(historyRef.current.length);
      } catch { /* noop */ }
    }

    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPoint(e);
    lastPointRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    isDrawingRef.current = true;
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPoint(e);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPointRef.current = { x, y };
  };

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) e.preventDefault();
    if (!isDrawingRef.current) return;
    if (e && canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    lastPointRef.current = null;
    const c = canvasRef.current;
    if (c && c.width > 0 && c.height > 0) {
      try { draftRef.current = c.toDataURL('image/png'); } catch { /* noop */ }
    }
    isDrawingRef.current = false;
    setIsDrawing(false);
    setHasStrokes(true);
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    setHistoryLen(historyRef.current.length);
    draftRef.current = prev;
    initCanvas(prev);
    if (historyRef.current.length === 0 && !value) setHasStrokes(false);
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, c.width, c.height);
    }
    draftRef.current = '';
    historyRef.current = [];
    setHistoryLen(0);
    setHasStrokes(false);
  };

  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    onChange(draftRef.current || c.toDataURL('image/png'));
    setIsOpen(false);
  };

  const cancel = () => {
    draftRef.current = '';
    historyRef.current = [];
    setHistoryLen(0);
    setIsOpen(false);
  };

  const removeSignature = () => {
    onChange('');
    draftRef.current = '';
    historyRef.current = [];
    setHistoryLen(0);
  };

  return (
    <div>
      <label className="block text-sm font-bold text-surface-700 dark:text-surface-300 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* --- Inline: tap to sign area --- */}
      <div
        onClick={openPad}
        className="rounded-2xl border-2 border-dashed border-surface-300 dark:border-surface-600 bg-white/60 dark:bg-surface-800/60 cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 transition-colors overflow-hidden"
      >
        {value ? (
          <div className="p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="w-full h-24 object-contain" />
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center">
            <span className="text-surface-400 dark:text-surface-500 text-xs">Tocca per firmare</span>
          </div>
        )}
      </div>
      {helperText && value && (
        <p className="mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">{helperText}</p>
      )}
      {value && (
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            type="button"
            onClick={openPad}
            className="min-h-11 px-3 text-xs text-primary-500 hover:text-primary-600 font-medium"
          >
            Modifica
          </button>
          <button
            type="button"
            onClick={removeSignature}
            className="min-h-11 px-3 text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Rimuovi
          </button>
        </div>
      )}

      {/* Overlay in portal — sopra sidebar, sticky footer, ecc. */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px]"
              onClick={cancel}
              aria-hidden
            />

            <div
              className="fixed inset-0 z-[201] flex flex-col bg-white dark:bg-surface-900 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(85vh,40rem)] sm:w-[min(36rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={label}
            >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-200 dark:border-surface-700">
              <span className="text-sm font-bold text-surface-800 dark:text-surface-100 truncate">{label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={undo} disabled={historyLen === 0} className="min-h-9 px-3 text-xs rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 disabled:opacity-30 transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                  Annulla
                </button>
                <button type="button" onClick={clearCanvas} className="min-h-9 px-3 text-xs rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 transition-colors">
                  Pulisci
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="flex-1 min-h-0 sm:min-h-[50vh] relative overflow-hidden bg-white dark:bg-surface-800">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                onPointerCancel={stopDrawing}
              />
              {!hasStrokes && !isDrawing && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <p className="text-surface-300 dark:text-surface-600 text-sm">Disegna qui la tua firma</p>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="shrink-0 flex gap-3 px-4 py-3 border-t border-surface-200 dark:border-surface-700" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={cancel} className="flex-1 h-12 sm:h-11 rounded-xl text-sm font-bold border-2 border-red-400 text-red-600 dark:border-red-500 dark:text-red-400 bg-white dark:bg-surface-950 hover:bg-red-50 active:scale-[0.97] transition-all">
                Annulla
              </button>
              <button type="button" onClick={save} className="flex-[1.3] h-12 sm:h-11 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.97] shadow-md transition-all">
                Salva firma
              </button>
            </div>
          </div>
          </>,
          document.body
        )}
    </div>
  );
}
