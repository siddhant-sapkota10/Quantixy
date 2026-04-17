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
  const expression = question?.formatting?.expression;
  const hasVisual = Boolean(question?.diagramSpec);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <p className={promptClassName}>
        {expression ? <MathExpression text={expression} /> : <MathExpression text={prompt} />}
      </p>

      {hasVisual ? (
        <div className="neon-panel-soft mx-auto w-full max-w-[44rem] overflow-hidden rounded-2xl px-2 py-2 sm:px-3 sm:py-2.5">
          <QuestionVisual spec={question?.diagramSpec} />
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
