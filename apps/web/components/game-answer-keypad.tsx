"use client";

import { cn } from "@/lib/utils";

type GameAnswerKeypadProps = {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onClose?: () => void;
  showHeader?: boolean;
  className?: string;
};

type KeyDef = { label: string; insert?: string; action?: "backspace" | "clear" | "submit" };

const NUMPAD: KeyDef[] = [
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "⌫", action: "backspace" },
];

const OPS: KeyDef[] = [
  { label: "+", insert: "+" },
  { label: "−", insert: "-" },
  { label: "×", insert: "*" },
  { label: "÷", insert: "/" },
];

const MATH: KeyDef[] = [
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "/", insert: "/" },
  { label: "^", insert: "^" },
  { label: "√", insert: "sqrt(" },
  { label: "=", insert: "=" },
  { label: "Clear", action: "clear" },
  { label: "Enter", action: "submit" },
];

export function GameAnswerKeypad({
  value,
  disabled = false,
  onChange,
  onSubmit,
  onClose,
  showHeader = true,
  className,
}: GameAnswerKeypadProps) {
  const apply = (k: KeyDef) => {
    if (disabled) return;
    if (k.action === "submit") {
      onSubmit();
      return;
    }
    if (k.action === "clear") {
      onChange("");
      return;
    }
    if (k.action === "backspace") {
      onChange(value.slice(0, -1));
      return;
    }
    if (k.insert) {
      if (value.length >= 64) return;
      onChange(value + k.insert);
    }
  };

  return (
    <div className={cn("qx-answer-keypad q-card-subtle w-full min-w-0 rounded-3xl p-3", className)}>
      {showHeader ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">
            Keypad
          </p>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--qx-text-secondary)] hover:border-cyan-300/25 hover:text-[var(--qx-text-primary)]"
            >
              Close
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] gap-2 sm:gap-2.5">
        <div className="min-w-0">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">
            Numbers
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {NUMPAD.map((k) => (
              <button
                key={`num-${k.label}`}
                type="button"
                disabled={disabled}
                onClick={() => apply(k)}
                className={cn(
                  "qx-keypad-btn select-none rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2 text-center font-black text-[var(--qx-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-400/18 hover:bg-[var(--qx-card-hover)] disabled:cursor-not-allowed disabled:opacity-60",
                  k.action === "backspace" && "border-amber-300/16 bg-amber-500/10 text-amber-100"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-[4.15rem] sm:w-[4.75rem]">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">
            Ops
          </p>
          <div className="grid grid-rows-4 gap-2 sm:gap-2.5">
            {OPS.map((k) => (
              <button
                key={`op-${k.label}`}
                type="button"
                disabled={disabled}
                onClick={() => apply(k)}
                className="qx-keypad-btn select-none rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2 text-center font-black text-[var(--qx-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-400/18 hover:bg-[var(--qx-card-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="my-2 h-px w-full bg-white/5" />

      <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">
        Roots / Fractions / Exponents
      </p>
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {MATH.map((k) => (
          <button
            key={`math-${k.label}`}
            type="button"
            disabled={disabled}
            onClick={() => apply(k)}
            className={cn(
              "qx-keypad-btn select-none rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2 text-center font-black text-[var(--qx-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-400/18 hover:bg-[var(--qx-card-hover)] disabled:cursor-not-allowed disabled:opacity-60",
              k.action === "submit" && "col-span-2 border-cyan-300/22 bg-cyan-500/10 text-cyan-100",
              k.action === "clear" && "border-rose-300/18 bg-rose-500/10 text-rose-100"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

