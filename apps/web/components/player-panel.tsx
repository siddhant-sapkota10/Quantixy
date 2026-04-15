"use client";

import { AnimatePresence, motion } from "framer-motion";

type PlayerPanelProps = {
  label: string;
  score: number;
  rating?: number;
  strikes?: number;
  eliminated?: boolean;
  avatar?: string;
  streakLabel?: string | null;
  streakLevel?: "fire" | "unstoppable" | null;
  fastActive?: boolean;
  highlighted?: boolean;
  pulseKey: number;
  /** Increments on every correct answer — brief sky-blue glow + scale pulse. */
  scoreGlowKey?: number;
  /** Increments when this player's shield blocks a freeze — white flash. */
  shieldBlockFlashKey?: number;
  /** Increments when this player activates a power-up — sky-blue glow ring. */
  powerUpGlowKey?: number;
};

export function PlayerPanel({
  label,
  score,
  rating,
  strikes = 0,
  eliminated = false,
  avatar,
  streakLabel,
  streakLevel,
  fastActive = false,
  highlighted = false,
  pulseKey,
  scoreGlowKey = 0,
  shieldBlockFlashKey = 0,
  powerUpGlowKey = 0,
}: PlayerPanelProps) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 sm:gap-2">
      {/* Streak / fast badges */}
      <div className="flex min-h-[2rem] flex-col items-center justify-end text-center sm:min-h-[2.75rem]">
        <AnimatePresence mode="wait">
          {streakLabel ? (
            <motion.p
              key={`${label}-streak-${streakLabel}`}
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.22 }}
              className="text-xs font-bold uppercase tracking-[0.25em] text-sky-300"
            >
              {streakLabel} {streakLevel === "unstoppable" ? "⚡" : "🔥"}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {fastActive ? (
            <motion.p
              key={`${label}-fast`}
              initial={{ opacity: 0, scale: 0.92, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mt-1 text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300"
            >
              FAST ⚡
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Card + overlay stack */}
      <div className="relative w-full">
        {/* Existing streak/fast glow pulse — keyed by pulseKey */}
        <motion.div
          key={pulseKey}
          initial={{ scale: 1 }}
          animate={{
            scale: highlighted ? [1, 1.04, 1] : 1,
            boxShadow: highlighted
              ? [
                  "0 0 0 rgba(56, 189, 248, 0)",
                  "0 0 24px rgba(56, 189, 248, 0.28)",
                  "0 0 0 rgba(56, 189, 248, 0)",
                ]
              : "0 0 0 rgba(56, 189, 248, 0)",
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-center sm:p-4"
        >
          {avatar ? (
            <p className="text-2xl leading-none sm:text-3xl">{avatar}</p>
          ) : null}
          <p className="mt-1 truncate text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
          {typeof rating === "number" ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Rating {rating}
            </p>
          ) : null}
          <p className={`mt-1 text-[11px] uppercase tracking-[0.2em] ${eliminated ? "text-rose-300" : "text-slate-500"}`}>
            Strikes {strikes}/3
          </p>
          <p className="mt-2 text-3xl font-bold text-white sm:text-4xl">{score}</p>
        </motion.div>

        {/* Score glow overlay — fires on every correct answer */}
        {scoreGlowKey > 0 && (
          <motion.div
            key={`sg-${scoreGlowKey}`}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 0.45, 0], scale: [0.9, 1.05, 1] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.38) 0%, transparent 68%)",
            }}
          />
        )}

        {/* Shield-block flash overlay — bright white burst */}
        {shieldBlockFlashKey > 0 && (
          <>
            <motion.div
              key={`sf-${shieldBlockFlashKey}`}
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              style={{ background: "rgba(255,255,255,0.5)" }}
            />
            <motion.div
              key={`sfr-${shieldBlockFlashKey}`}
              className="pointer-events-none absolute inset-[-6px] rounded-[1.35rem] border-2 border-emerald-200/80"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: [0, 1, 0], scale: [0.94, 1.06, 1.1] }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </>
        )}

        {/* Power-up activation glow overlay */}
        {powerUpGlowKey > 0 && (
          <motion.div
            key={`pg-${powerUpGlowKey}`}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0.88, 1.07, 1] }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.5) 0%, transparent 62%)",
            }}
          />
        )}
      </div>
    </div>
  );
}
