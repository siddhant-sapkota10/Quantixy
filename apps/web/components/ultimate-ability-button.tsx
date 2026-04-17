"use client";

import { motion } from "framer-motion";
import { normalizeUltimateType, ULTIMATE_VFX } from "@/lib/ultimate-vfx";

type UltimateAbilityButtonProps = {
  type: string;
  ultimateName: string;
  charge: number;
  ready: boolean;
  used: boolean;
  implemented: boolean;
  activating?: boolean;
  disabled?: boolean;
  onActivate: () => void;
  activationBurstKey?: number;
  size?: "compact" | "regular";
};

export function UltimateAbilityButton({
  type,
  ultimateName,
  charge,
  ready,
  used,
  implemented,
  activating = false,
  disabled = false,
  onActivate,
  activationBurstKey = 0,
  size = "regular"
}: UltimateAbilityButtonProps) {
  const normalizedType = normalizeUltimateType(type);
  const config = ULTIMATE_VFX[normalizedType];
  const pct = Math.max(0, Math.min(100, Math.round(charge)));
  const canActivate = ready && !used && implemented && !activating && !disabled;
  const isCharging = !used && implemented && !ready;

  const stateLabel = used
    ? "USED"
    : !implemented
      ? "COMING SOON"
      : activating
        ? "ACTIVATING"
        : ready
          ? "READY"
          : "CHARGING";
  const subLabel = used
    ? "Ultimate spent"
    : !implemented
      ? "Not available yet"
      : ready
        ? "Tap to unleash"
        : `${pct}% charged`;

  const isCompact = size === "compact";

  return (
    <motion.button
      type="button"
      onClick={onActivate}
      disabled={!canActivate}
      whileHover={canActivate ? { scale: 1.01, y: -1 } : undefined}
      whileTap={canActivate ? { scale: 0.985, y: 0 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
      className={`group relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 ${
        canActivate
          ? "border-white/25 focus-visible:ring-white/45"
          : "border-indigo-300/25 opacity-85 saturate-[0.9]"
      } ${isCompact ? "px-3 py-2.5" : "px-3.5 py-3"}`}
      style={{
        background: canActivate ? config.presentation.buttonGradient : "linear-gradient(145deg, rgba(12,20,43,0.95), rgba(10,16,36,0.92))",
        boxShadow: canActivate
          ? `0 0 0 1px ${config.presentation.primary}44, 0 16px 34px rgba(3,8,20,0.62), 0 0 28px ${config.glow}`
          : "0 10px 24px rgba(3,8,20,0.55)"
      }}
      aria-label={`${ultimateName} ${stateLabel}`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse at 16% 25%, rgba(255,255,255,0.42) 0%, transparent 44%), radial-gradient(ellipse at 84% 72%, rgba(255,255,255,0.2) 0%, transparent 50%)"
          }}
        />

        {isCharging ? (
          <motion.div
            className="absolute inset-y-0 left-0"
            initial={false}
            animate={{ width: `${pct}%`, opacity: 0.24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              background: `linear-gradient(90deg, ${config.presentation.primary}66 0%, ${config.presentation.secondary}33 100%)`
            }}
          />
        ) : null}

        {ready && !activating ? (
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: [0.08, 0.26, 0.12] }}
            transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: `radial-gradient(circle at 50% 50%, ${config.presentation.primary}44 0%, transparent 68%)`
            }}
          />
        ) : null}

        {activating ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 0.36, ease: "easeOut" }}
            style={{
              background: `radial-gradient(circle at 50% 50%, ${config.presentation.secondary}88 0%, transparent 70%)`
            }}
          />
        ) : null}

        {activationBurstKey > 0 ? (
          <motion.div
            key={`ult-burst-${activationBurstKey}`}
            className="absolute inset-[-6px] rounded-[1.1rem] border"
            style={{ borderColor: `${config.presentation.primary}88` }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: [0, 1, 0], scale: [0.92, 1.03, 1.08] }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        ) : null}
      </div>

      <div className="relative flex items-start gap-2.5">
        <div
          className={`flex shrink-0 items-center justify-center rounded-xl border ${
            isCompact ? "h-8 w-8" : "h-9 w-9"
          } ${canActivate ? "border-white/35 bg-slate-950/35 text-white" : "border-slate-600/60 bg-slate-950/65 text-slate-300"}`}
        >
          <UltimateGlyph type={normalizedType} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`truncate font-black uppercase tracking-[0.18em] ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
              {ultimateName}
            </p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 font-bold uppercase tracking-[0.14em] ${
                isCompact ? "text-[9px]" : "text-[10px]"
              } ${canActivate ? "border-white/45 bg-slate-950/45 text-white" : "border-slate-500/55 bg-slate-950/70 text-slate-300"}`}
            >
              {stateLabel}
            </span>
          </div>

          <p className={`mt-0.5 text-slate-100/92 ${isCompact ? "text-[10px]" : "text-[11px]"}`}>{subLabel}</p>

          <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${canActivate ? "bg-slate-950/38" : "bg-slate-800/75"}`}>
            <motion.div
              className="h-full rounded-full"
              initial={false}
              animate={{ width: `${used ? 100 : pct}%` }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              style={{
                background: canActivate
                  ? "linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 100%)"
                  : `linear-gradient(90deg, ${config.presentation.primary}88 0%, ${config.presentation.secondary}77 100%)`,
                boxShadow: canActivate ? `0 0 14px ${config.presentation.primary}aa` : "none"
              }}
            />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function UltimateGlyph({ type }: { type: "rapid_fire" | "system_corrupt" | "perfect_sequence" | "overpower" | "shield" | "double" }) {
  if (type === "rapid_fire") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L4 13h6l-1 9 9-11h-6z" />
      </svg>
    );
  }

  if (type === "system_corrupt") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h7M13 7h7" />
        <path d="M4 12h4M10 12h10" opacity="0.75" />
        <path d="M4 17h10M16 17h4" opacity="0.6" />
      </svg>
    );
  }

  if (type === "perfect_sequence") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19V5h14v14H5z" opacity="0.65" />
        <path d="M8 9h8M8 12h6M8 15h4" />
      </svg>
    );
  }

  if (type === "overpower") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 15l6-10 6 10" />
        <path d="M8 15v4h8v-4" opacity="0.7" />
      </svg>
    );
  }

  if (type === "shield") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 5-3.6 8-7 10-3.4-2-7-5-7-10V6z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 6.2L21 10l-5 4.2L17.4 21 12 17.8 6.6 21 8 14.2 3 10l6.6-1.8z" />
    </svg>
  );
}
