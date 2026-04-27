"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const COLORS = ["#e2e8f0", "#7dd3fc", "#fda4af", "#fcd34d", "#86efac", "#c4b5fd"];
const SIZES = [2, 4, 7];
const MAX_UNDO = 24;

/**
 * "inline-collapsible" — default: Show/Hide toggle button, collapsed by default.
 * "always-open"        — canvas always visible, no toggle. For tablet landscape panels.
 * "standalone"         — canvas + controls only, no wrapper chrome. For sheets/modals.
 */
type DisplayMode = "inline-collapsible" | "always-open" | "standalone";

type WorkingScratchpadProps = {
  /** When true, the pad cannot be drawn on (e.g. Neural Jam / blackout). */
  answerInputLocked?: boolean;
  onOpenChange?: (open: boolean) => void;
  displayMode?: DisplayMode;
  /** Override canvas height (CSS px). Defaults to h-40 (160px) for inline, taller for always-open. */
  canvasHeight?: number;
  className?: string;
};

function PenIcon({ tipColor }: { tipColor: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l4-.8L19 8a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5 16l-1 4z" />
      <circle cx="7.5" cy="17.5" r="1.4" fill={tipColor} stroke="none" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14l6-8a2 2 0 0 1 2.8-.4L20 10.8a2 2 0 0 1 .4 2.8L15 20H8z" />
      <path d="M8 20h12" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3 13A9 9 0 1 0 6 6.3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function WorkingScratchpad({
  answerInputLocked = false,
  onOpenChange,
  displayMode = "inline-collapsible",
  canvasHeight,
  className,
}: WorkingScratchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(displayMode === "always-open" || displayMode === "standalone");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [showGrid, setShowGrid] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<string[]>([]);

  // ----- Canvas initialisation / resize (with content preservation) -----
  const initCanvas = useCallback((preserveContent: boolean) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const cssW = Math.floor(rect.width);
    const cssH = Math.floor(rect.height);
    if (cssW < 10 || cssH < 10) return;

    const dpr = window.devicePixelRatio || 1;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);

    // Don't resize if dimensions haven't changed (prevents content loss on re-renders)
    if (canvas.width === physW && canvas.height === physH) return;

    let savedImage: string | null = null;
    if (preserveContent && canvas.width > 0 && canvas.height > 0) {
      try { savedImage = canvas.toDataURL(); } catch { /* ignore */ }
    }

    canvas.width = physW;
    canvas.height = physH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (savedImage) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH);
      img.src = savedImage;
    }
  }, []);

  // Initial setup when pad opens (or on mount for always-open)
  useEffect(() => {
    if (!open) return;
    // Small rAF delay ensures the wrapper has been laid out
    const id = requestAnimationFrame(() => initCanvas(false));
    return () => cancelAnimationFrame(id);
  }, [open, initCanvas]);

  // ResizeObserver: re-init canvas if wrapper size changes, preserving content
  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => initCanvas(true));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [open, initCanvas]);

  // Keep displayMode in sync (e.g. if parent switches mode at runtime)
  useEffect(() => {
    const shouldBeOpen = displayMode === "always-open" || displayMode === "standalone";
    if (shouldBeOpen && !open) setOpen(true);
  }, [displayMode, open]);

  useEffect(() => {
    if (answerInputLocked && displayMode === "inline-collapsible") {
      setOpen(false);
    }
  }, [answerInputLocked, displayMode]);

  useEffect(() => {
    if (displayMode === "inline-collapsible") onOpenChange?.(open);
  }, [open, onOpenChange, displayMode]);

  // Keyboard undo: Ctrl+Z / Cmd+Z
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoDraw();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Drawing helpers -----
  const getPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const snap = canvas.toDataURL();
      undoStackRef.current.push(snap);
      if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    } catch { /* ignore cross-origin or empty canvas */ }
  }, []);

  const undoDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const snap = undoStackRef.current.pop();
    ctx.clearRect(0, 0, cssW, cssH);
    if (snap) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH);
      img.src = snap;
    }
  }, []);

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = Math.max(18, size * 5);
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (answerInputLocked) return;
    // Save snapshot before starting a new stroke
    saveSnapshot();
    drawingRef.current = true;
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    const p = getPos(event);
    lastRef.current = p;
    // Draw a dot on press (for taps / single points)
    drawLine(p.x, p.y, p.x, p.y);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (answerInputLocked || !drawingRef.current) return;
    const p = getPos(event);
    const last = lastRef.current;
    if (!last) { lastRef.current = p; return; }
    drawLine(last.x, last.y, p.x, p.y);
    lastRef.current = p;
  };

  const stopDraw = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    saveSnapshot(); // allow undo of clear
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  };

  // Grid is applied via CSS background-image for zero canvas interference
  const gridStyle = showGrid
    ? {
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }
    : {};

  // ----- Derived -----
  const resolvedCanvasHeight = canvasHeight ?? (displayMode === "always-open" ? undefined : 160);

  // ----- Controls toolbar (shared across modes) -----
  const ControlsToolbar = (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* Tool toggle: pen / eraser */}
      <button
        type="button"
        onClick={() => setTool((t) => (t === "eraser" ? "pen" : "eraser"))}
        className={cn(
          "inline-flex min-h-[36px] min-w-[36px] items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition-all duration-150",
          tool === "eraser"
            ? "border-rose-300/50 bg-rose-950/70 text-rose-200"
            : "border-indigo-300/35 bg-slate-900/78 hover:border-cyan-300/60"
        )}
        aria-label={tool === "eraser" ? "Switch to pen" : "Switch to eraser"}
      >
        {tool === "eraser" ? <EraserIcon /> : <PenIcon tipColor={color} />}
        <span className="hidden xs:inline">{tool === "eraser" ? "Erase" : "Pen"}</span>
      </button>

      {/* Undo */}
      <button
        type="button"
        onClick={undoDraw}
        className="inline-flex min-h-[36px] min-w-[36px] items-center gap-1 rounded-lg border border-indigo-300/35 bg-slate-900/78 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition-all duration-150 hover:border-cyan-300/60"
        aria-label="Undo last stroke"
      >
        <UndoIcon />
        <span className="hidden xs:inline">Undo</span>
      </button>

      {/* Clear */}
      <button
        type="button"
        onClick={clearCanvas}
        className="inline-flex min-h-[36px] items-center rounded-lg border border-indigo-300/35 bg-slate-900/78 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition-all duration-150 hover:border-rose-300/50 hover:text-rose-200"
      >
        Clear
      </button>

      {/* Grid toggle */}
      <button
        type="button"
        onClick={() => setShowGrid((g) => !g)}
        className={cn(
          "inline-flex min-h-[36px] min-w-[36px] items-center rounded-lg border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition-all duration-150",
          showGrid
            ? "border-cyan-300/50 bg-cyan-950/60 text-cyan-200"
            : "border-indigo-300/35 bg-slate-900/78 hover:border-cyan-300/60"
        )}
        aria-label={showGrid ? "Hide grid" : "Show grid"}
      >
        <GridIcon />
      </button>

      {/* Color swatches */}
      <div className="flex items-center gap-1.5">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => { setColor(swatch); setTool("pen"); }}
            aria-label={`Color ${swatch}`}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition-all duration-100 hover:scale-110 active:scale-95",
              color === swatch && tool === "pen"
                ? "border-white/70 shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                : "border-slate-600/60"
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>

      {/* Size buttons */}
      <div className="flex items-center gap-1">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSize(s)}
            className={cn(
              "min-h-[28px] min-w-[28px] rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              size === s ? "bg-cyan-400/25 text-cyan-100" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );

  // ===== Render modes =====

  if (displayMode === "always-open") {
    return (
      <div
        className={cn(
          "neon-panel-soft relative flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-2xl p-2 sm:p-2.5",
          className
        )}
      >
        <div className="shrink-0">{ControlsToolbar}</div>
        <div
          ref={wrapRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-indigo-300/28 bg-[radial-gradient(circle_at_center,rgba(22,34,69,0.88)_0%,rgba(3,8,24,1)_100%)]"
          style={{ ...gridStyle, touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 block h-full w-full max-h-full max-w-full",
              "touch-none select-none",
              answerInputLocked ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-crosshair"
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDraw}
            onPointerCancel={stopDraw}
            onPointerLeave={stopDraw}
          />
        </div>
      </div>
    );
  }

  if (displayMode === "standalone") {
    return (
      <div className={cn("relative flex h-full min-h-0 flex-col gap-2 overflow-hidden", className)}>
        <div className="shrink-0">{ControlsToolbar}</div>
        <div
          ref={wrapRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-indigo-300/28 bg-[radial-gradient(circle_at_center,rgba(22,34,69,0.88)_0%,rgba(3,8,24,1)_100%)]"
          style={{ ...gridStyle, touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 block h-full w-full max-h-full max-w-full",
              "touch-none select-none",
              answerInputLocked ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-crosshair"
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDraw}
            onPointerCancel={stopDraw}
            onPointerLeave={stopDraw}
          />
        </div>
      </div>
    );
  }

  // "inline-collapsible" mode (default)
  if (!open) {
    return (
      <div className={cn("flex items-center justify-start", className)}>
        <button
          type="button"
          disabled={answerInputLocked}
          title={answerInputLocked ? "Unavailable during input lock" : undefined}
          onClick={() => setOpen(true)}
          className="rounded-xl border border-indigo-300/28 bg-slate-900/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 shadow-[0_10px_30px_rgba(2,6,23,0.35)] backdrop-blur transition-all duration-200 hover:border-cyan-300/55 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-indigo-300/28"
        >
          Show Workpad
        </button>
      </div>
    );
  }

  return (
    <div className={cn("neon-panel-soft relative overflow-hidden rounded-2xl p-2 sm:p-2.5", className)}>
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-indigo-300/35 bg-slate-900/78 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition-all duration-200 hover:border-rose-300/50 hover:text-rose-200 sm:px-3 sm:text-[11px]"
        >
          Hide
        </button>
        {ControlsToolbar}
      </div>

      {/* Canvas — clipped to this box only; drawing cannot extend outside */}
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-indigo-300/28 bg-[radial-gradient(circle_at_center,rgba(22,34,69,0.88)_0%,rgba(3,8,24,1)_100%)]"
        style={{ height: `${resolvedCanvasHeight}px`, ...gridStyle, touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 block h-full w-full max-h-full max-w-full",
            "touch-none select-none",
            answerInputLocked ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-crosshair"
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDraw}
          onPointerCancel={stopDraw}
          onPointerLeave={stopDraw}
        />
      </div>
    </div>
  );
}
