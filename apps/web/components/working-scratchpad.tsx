"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = ["#e2e8f0", "#7dd3fc", "#fda4af", "#fcd34d", "#86efac"];
const SIZES = [2, 3, 5];

type WorkingScratchpadProps = {
  /** When true, the pad cannot be opened or drawn (e.g. Neural Jam / blackout). */
  answerInputLocked?: boolean;
};

export function WorkingScratchpad({ answerInputLocked = false }: WorkingScratchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(260, Math.floor(rect.width * dpr));
    canvas.height = Math.max(160, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open]);

  useEffect(() => {
    if (answerInputLocked) {
      setOpen(false);
    }
  }, [answerInputLocked]);

  const getPos = (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = Math.max(12, size * 5);
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

  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (answerInputLocked) return;
    drawingRef.current = true;
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    const p = getPos(event);
    lastRef.current = p;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (answerInputLocked || !drawingRef.current) return;
    const p = getPos(event);
    const last = lastRef.current;
    if (!last) {
      lastRef.current = p;
      return;
    }
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const PenIcon = ({ tipColor }: { tipColor: string }) => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l4-.8L19 8a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5 16l-1 4z" />
      <circle cx="7.5" cy="17.5" r="1.4" fill={tipColor} stroke="none" />
    </svg>
  );

  const EraserIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14l6-8a2 2 0 0 1 2.8-.4L20 10.8a2 2 0 0 1 .4 2.8L15 20H8z" />
      <path d="M8 20h12" />
    </svg>
  );

  if (!open) {
    return (
      <div className="flex items-center justify-start">
        <button
          type="button"
          disabled={answerInputLocked}
          title={answerInputLocked ? "Unavailable during input lock" : undefined}
          onClick={() => setOpen(true)}
          className="rounded-xl border border-indigo-300/28 bg-slate-900/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 shadow-[0_10px_30px_rgba(2,6,23,0.35)] backdrop-blur transition-all duration-200 ease-premium hover:border-cyan-300/55 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-indigo-300/28"
        >
          Show Workpad
        </button>
      </div>
    );
  }

  return (
    <div className="neon-panel-soft rounded-2xl p-2 sm:p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-indigo-300/35 bg-slate-900/78 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition-all duration-200 ease-premium hover:border-cyan-300/60 sm:px-3 sm:text-[11px]"
        >
          Hide Workpad
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTool((current) => (current === "eraser" ? "pen" : "eraser"));
            }}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-300/35 bg-slate-900/78 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition-all duration-200 ease-premium hover:border-cyan-300/60"
          >
            {tool === "eraser" ? <EraserIcon /> : <PenIcon tipColor={color} />}
            {tool === "eraser" ? "Eraser" : "Pen"}
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-md border border-indigo-300/35 bg-slate-900/78 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition-all duration-200 ease-premium hover:border-cyan-300/60"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => {
              setColor(swatch);
              setTool("pen");
            }}
            aria-label={`color-${swatch}`}
            className="h-5 w-5 rounded-full border border-slate-600"
            style={{ backgroundColor: swatch }}
          />
        ))}
        <div className="ml-2 flex items-center gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                size === s ? "bg-cyan-400/25 text-cyan-100" : "bg-slate-800 text-slate-300"
              }`}
            >
              {s}px
            </button>
          ))}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="h-40 overflow-hidden rounded-xl border border-indigo-300/28 bg-[radial-gradient(circle_at_center,rgba(22,34,69,0.88)_0%,rgba(3,8,24,1)_100%)]"
      >
        <canvas
          ref={canvasRef}
          className={`h-full w-full touch-none ${answerInputLocked ? "pointer-events-none opacity-50" : ""}`}
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
