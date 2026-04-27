"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { MathExpression } from "@/components/math-expression";
import { QuestionVisual } from "@/components/question-visual";
import type { DuelQuestion } from "@/lib/question-model";

type QuestionContentProps = {
  question: DuelQuestion | null;
  fallbackPrompt?: string;
  promptClassName?: string;
  compact?: boolean;
  fitViewport?: boolean;
};

export function QuestionContent({
  question,
  fallbackPrompt = "Get ready...",
  promptClassName = "text-2xl font-black tracking-tight text-white sm:text-4xl md:text-5xl",
  compact = false,
  fitViewport = false,
}: QuestionContentProps) {
  const prompt = question?.prompt ?? fallbackPrompt;
  const hasVisual = Boolean(question?.diagramSpec);
  const renderMode = question?.renderMode ?? "plain_text";
  // Always show the full prompt so task instructions never disappear in math topics.
  const displayText = prompt;
  const graphFirst = renderMode === "graph";
  const compactPromptClass =
    renderMode === "graph"
      ? "text-lg font-bold tracking-tight text-white sm:text-xl"
      : renderMode === "diagram" || renderMode === "table"
        ? "text-xl font-bold tracking-tight text-white sm:text-2xl"
        : promptClassName;
  const tableRows = question?.visualData?.tables ?? [];

  const promptRef = useRef<HTMLParagraphElement | null>(null);
  const equationRef = useRef<HTMLSpanElement | null>(null);

  const trueFalseParts = useMemo(() => {
    const t = String(displayText ?? "").trim();
    // Common pattern in Quantixy prompts: "True or False: <equation>. <sentence...>"
    const m = /^true\s*or\s*false:\s*(.+?)(?:\.\s*(.+))?$/i.exec(t);
    if (!m) return null;
    return {
      label: "True or False:",
      equation: (m[1] ?? "").trim(),
      rest: (m[2] ?? "").trim(),
    };
  }, [displayText]);

  const forceSingleLine = useMemo(() => {
    // Only enforce single-line for equation-like prompts.
    // True/False and long wordy prompts should wrap normally.
    const t = String(displayText ?? "").trim();
    if (!t) return false;

    // Common non-equation patterns: explicit "True or False" etc.
    if (/true\s+or\s+false/i.test(t)) return false;

    // Heuristics for "equation-ish" prompts:
    // - contains equals/inequality, or
    // - contains operators with digits, or
    // - contains sqrt / fractions / exponents patterns we render specially.
    const hasEqSymbol = /[=<>≤≥≠≈]/.test(t);
    const hasDigits = /\d/.test(t);
    const hasOperators = /[+\-×÷*/^]/.test(t);
    const hasFrac = /\b\d+\s*\/\s*\d+\b/.test(t) || /\bd\/d[a-z]\b/i.test(t) || /\bd[a-z]\/d[a-z]\b/i.test(t);
    const hasSqrt = /\bsqrt\(/i.test(t) || /√/.test(t);

    if (hasEqSymbol) return true;
    if (hasSqrt || hasFrac) return true;
    if (hasDigits && hasOperators) return true;
    return false;
  }, [displayText]);

  const scaleKey = useMemo(() => {
    // Recompute scale when prompt or layout mode changes.
    return `${displayText}__${compact ? "c" : "n"}__${fitViewport ? "fit" : "free"}__${renderMode}__${forceSingleLine ? "1l" : "wrap"}`;
  }, [displayText, compact, fitViewport, renderMode, forceSingleLine]);

  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el || typeof window === "undefined") return;

    const compute = () => {
      if (!forceSingleLine) {
        // Ensure we never keep a stale inline font-size from prior equation prompts.
        el.style.fontSize = "";
        return;
      }

      // Start from the natural responsive font-size (from CSS clamp).
      el.style.fontSize = "";
      const basePx = Number.parseFloat(window.getComputedStyle(el).fontSize || "0");
      if (!Number.isFinite(basePx) || basePx <= 0) return;

      const minPx = 13;
      let px = Math.round(basePx);
      el.style.fontSize = `${px}px`;

      // Shrink in small steps until it fits on one line.
      // Hard cap prevents pathological loops on extreme content.
      for (let i = 0; i < 28; i += 1) {
        const w = el.clientWidth;
        const sw = el.scrollWidth;
        if (w <= 0 || sw <= 0) break;
        if (sw <= w) break;
        if (px <= minPx) break;
        px -= 1;
        el.style.fontSize = `${px}px`;
      }
    };

    // Initial (pre-paint) measure.
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [scaleKey, forceSingleLine]);

  useLayoutEffect(() => {
    const el = equationRef.current;
    if (!el || typeof window === "undefined") return;
    if (!trueFalseParts?.equation) {
      el.style.fontSize = "";
      return;
    }

    const compute = () => {
      el.style.fontSize = "";
      const basePx = Number.parseFloat(window.getComputedStyle(el).fontSize || "0");
      if (!Number.isFinite(basePx) || basePx <= 0) return;

      const minPx = 13;
      let px = Math.round(basePx);
      el.style.fontSize = `${px}px`;
      for (let i = 0; i < 28; i += 1) {
        const w = el.clientWidth;
        const sw = el.scrollWidth;
        if (w <= 0 || sw <= 0) break;
        if (sw <= w) break;
        if (px <= minPx) break;
        px -= 1;
        el.style.fontSize = `${px}px`;
      }
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [trueFalseParts?.equation]);

  return (
    <div className={`${compact ? "space-y-3" : "space-y-4"} ${fitViewport ? "qx-question-fit" : ""}`}>
      {graphFirst && hasVisual ? (
        <div className="qx-question-visual neon-panel-soft mx-auto w-full max-w-[60rem] overflow-hidden rounded-2xl px-2 py-2 sm:px-3 sm:py-3">
          <QuestionVisual spec={question?.diagramSpec} compact={compact} />
        </div>
      ) : null}

      {trueFalseParts ? (
        <div className={`${compactPromptClass} qx-question-prompt space-y-2`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-textSecondary/70">
            {trueFalseParts.label}
          </p>
          <p className="qx-question-prompt qx-question-prompt--nowrap">
            <span
              ref={equationRef}
              className="qx-question-inline qx-question-inline--nowrap"
              style={{ display: "inline-block", maxWidth: "100%" }}
            >
              <MathExpression text={trueFalseParts.equation} />
            </span>
          </p>
          {trueFalseParts.rest ? (
            <p className="qx-question-prompt">
              <MathExpression text={trueFalseParts.rest} />
            </p>
          ) : null}
        </div>
      ) : (
        <p
          ref={promptRef}
          className={`${compactPromptClass} qx-question-prompt ${forceSingleLine ? "qx-question-prompt--nowrap" : ""}`}
        >
          <span className={`qx-question-inline ${forceSingleLine ? "qx-question-inline--nowrap" : ""}`}>
            <MathExpression text={displayText} />
          </span>
        </p>
      )}

      {!graphFirst && hasVisual ? (
        <div className="qx-question-visual neon-panel-soft mx-auto w-full max-w-[60rem] overflow-hidden rounded-2xl px-2 py-2 sm:px-3 sm:py-3">
          <QuestionVisual spec={question?.diagramSpec} compact={compact} />
        </div>
      ) : null}

      {renderMode === "table" && tableRows.length > 0 ? (
        <div className="qx-question-table mx-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/60">
          <table className="w-full table-fixed border-collapse text-sm text-slate-100 sm:text-base">
            <thead>
              <tr className="bg-slate-900/80">
                <th className="border border-slate-700 px-3 py-2 font-semibold">x</th>
                <th className="border border-slate-700 px-3 py-2 font-semibold">y</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr key={`${row.x}-${row.y}-${idx}`} className="text-center">
                  <td className="border border-slate-700 px-3 py-2 tabular-nums">{row.x}</td>
                  <td className="border border-slate-700 px-3 py-2 tabular-nums">{row.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {question?.unit ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Unit: {question.unit}
        </p>
      ) : null}
    </div>
  );
}
