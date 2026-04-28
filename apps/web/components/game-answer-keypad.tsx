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

type KeyDef = {
  label: string;
  insert?: string;
  action?: "backspace" | "clear" | "submit";
};

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
  { label: "Del", action: "backspace" },
];

const OPS: KeyDef[] = [
  { label: "+", insert: "+" },
  { label: "-", insert: "-" },
  { label: "x", insert: "*" },
  { label: "/", insert: "/" },
];

const MATH: KeyDef[] = [
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "^", insert: "^" },
  { label: "sqrt", insert: "sqrt(" },
  { label: "=", insert: "=" },
  { label: "Clear", action: "clear" },
  { label: "Enter", action: "submit" },
];

function keyTone(k: KeyDef) {
  if (k.action === "submit") return "qx-keypad-btn--enter qx-keypad-btn--wide";
  if (k.action === "clear") return "qx-keypad-btn--clear";
  if (k.action === "backspace") return "qx-keypad-btn--delete";
  return "";
}

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

      <div className="qx-keypad-layout">
        <div className="qx-keypad-section qx-keypad-section--numbers">
          <p className="qx-keypad-label">Numbers</p>
          <div className="qx-keypad-grid qx-keypad-grid--numbers">
            {NUMPAD.map((k) => (
              <button
                key={`num-${k.label}`}
                type="button"
                disabled={disabled}
                onClick={() => apply(k)}
                className={cn("qx-keypad-btn select-none", keyTone(k))}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qx-keypad-section qx-keypad-section--ops">
          <p className="qx-keypad-label">Ops</p>
          <div className="qx-keypad-grid qx-keypad-grid--ops">
            {OPS.map((k) => (
              <button
                key={`op-${k.label}`}
                type="button"
                disabled={disabled}
                onClick={() => apply(k)}
                className="qx-keypad-btn qx-keypad-btn--op select-none"
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qx-keypad-section qx-keypad-section--math">
          <p className="qx-keypad-label">Roots / exponents</p>
          <div className="qx-keypad-grid qx-keypad-grid--math">
            {MATH.map((k) => (
              <button
                key={`math-${k.label}`}
                type="button"
                disabled={disabled}
                onClick={() => apply(k)}
                className={cn("qx-keypad-btn select-none", keyTone(k))}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
