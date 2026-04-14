"use client";

import { motion } from "framer-motion";

type PowerUpType = "freeze" | "shield" | null;

const POWER_UP_META = {
  freeze: {
    icon: "❄️",
    label: "Freeze"
  },
  shield: {
    icon: "🛡️",
    label: "Shield"
  }
} as const;

type PowerUpSlotProps = {
  type: PowerUpType;
  disabled?: boolean;
  onUse?: () => void;
  pulseKey?: number;
  align?: "left" | "right";
};

export function PowerUpSlot({
  type,
  disabled = false,
  onUse,
  pulseKey = 0,
  align = "left"
}: PowerUpSlotProps) {
  const content = type ? POWER_UP_META[type] : null;
  const justifyClass = align === "right" ? "items-end" : "items-start";

  return (
    <div className={`flex flex-col ${justifyClass} gap-2`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Power-Up
      </span>
      <motion.button
        key={`${type ?? "empty"}-${pulseKey}`}
        type="button"
        onClick={onUse}
        disabled={!type || disabled || !onUse}
        initial={{ scale: 1 }}
        animate={{
          scale: pulseKey > 0 ? [1, 1.08, 1] : 1,
          boxShadow:
            pulseKey > 0
              ? [
                  "0 0 0 rgba(125,211,252,0)",
                  "0 0 24px rgba(125,211,252,0.35)",
                  "0 0 0 rgba(125,211,252,0)"
                ]
              : "0 0 0 rgba(125,211,252,0)"
        }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className={`min-w-[132px] rounded-2xl border px-4 py-3 text-left transition ${
          type
            ? "border-sky-400/30 bg-sky-500/10 text-sky-100 hover:border-sky-300/50"
            : "border-slate-800 bg-slate-950/60 text-slate-500"
        } disabled:cursor-not-allowed disabled:opacity-80`}
      >
        {content ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{content.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{content.label}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-200">
                {onUse ? "Ready" : "Holding"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Empty</span>
            <span className="text-lg leading-none opacity-60">+</span>
          </div>
        )}
      </motion.button>
    </div>
  );
}
