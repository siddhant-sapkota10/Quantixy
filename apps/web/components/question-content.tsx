"use client";

import { MathExpression } from "@/components/math-expression";
import { QuestionVisual } from "@/components/question-visual";
import type { DuelQuestion } from "@/lib/question-model";

type QuestionContentProps = {
  question: DuelQuestion | null;
  fallbackPrompt?: string;
  promptClassName?: string;
  compact?: boolean;
};

export function QuestionContent({
  question,
  fallbackPrompt = "Get ready...",
  promptClassName = "text-2xl font-black tracking-tight text-white sm:text-4xl md:text-5xl",
  compact = false,
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

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {graphFirst && hasVisual ? (
        <div className="neon-panel-soft mx-auto w-full max-w-[60rem] overflow-hidden rounded-2xl px-2 py-2 sm:px-3 sm:py-3">
          <QuestionVisual spec={question?.diagramSpec} />
        </div>
      ) : null}

      <p className={compactPromptClass}>
        <MathExpression text={displayText} />
      </p>

      {!graphFirst && hasVisual ? (
        <div className="neon-panel-soft mx-auto w-full max-w-[60rem] overflow-hidden rounded-2xl px-2 py-2 sm:px-3 sm:py-3">
          <QuestionVisual spec={question?.diagramSpec} />
        </div>
      ) : null}

      {renderMode === "table" && tableRows.length > 0 ? (
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/60">
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
