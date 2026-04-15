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
  scoreGlowKey?: number;
  shieldBlockFlashKey?: number;
  powerUpGlowKey?: number;
  ultimateFxKey?: number;
  ultimateFxType?: "rapid_fire" | "jam" | "shield" | "double" | null;
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
  ultimateFxKey = 0,
  ultimateFxType = null
}: PlayerPanelProps) {
  const ultimateFxByType: Record<NonNullable<PlayerPanelProps["ultimateFxType"]>, { tint: string; ring: string }> = {
    rapid_fire: { tint: "rgba(250,204,21,0.45)", ring: "rgba(250,204,21,0.82)" },
    jam: { tint: "rgba(167,139,250,0.48)", ring: "rgba(167,139,250,0.82)" },
    shield: { tint: "rgba(34,211,238,0.42)", ring: "rgba(34,211,238,0.8)" },
    double: { tint: "rgba(251,113,133,0.48)", ring: "rgba(251,113,133,0.82)" }
  };
  const ultimateFx = ultimateFxType ? ultimateFxByType[ultimateFxType] : null;

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div className="flex h-12 flex-col items-center justify-end text-center sm:h-14">
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
              {streakLabel} {streakLevel === "unstoppable" ? "?" : "??"}
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
              FAST ?
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="relative w-full">
        <motion.div
          key={pulseKey}
          initial={{ scale: 1 }}
          animate={{
            scale: highlighted ? [1, 1.04, 1] : 1,
            boxShadow: highlighted
              ? [
                  "0 0 0 rgba(56, 189, 248, 0)",
                  "0 0 24px rgba(56, 189, 248, 0.28)",
                  "0 0 0 rgba(56, 189, 248, 0)"
                ]
              : "0 0 0 rgba(56, 189, 248, 0)"
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full min-h-[11.5rem] rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-center sm:min-h-[12.25rem] sm:p-4"
        >
          {avatar ? <p className="text-2xl leading-none sm:text-3xl">{avatar}</p> : null}
          <p className="mt-1 truncate px-1 text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <div className="mt-1 flex h-4 items-center justify-center">
            {typeof rating === "number" ? (
              <p className="truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">Rating {rating}</p>
            ) : (
              <p className="text-[11px] uppercase tracking-[0.16em] text-transparent">Rating</p>
            )}
          </div>
          <div className="mt-0.5 flex h-4 items-center justify-center">
            <p className={`text-[11px] uppercase tracking-[0.16em] ${eliminated ? "text-rose-300" : "text-slate-500"}`}>
              Strikes {strikes}/3
            </p>
          </div>
          <div className="mt-2 flex h-11 items-center justify-center sm:h-12">
            <p className="text-3xl font-bold text-white tabular-nums sm:text-4xl">{score}</p>
          </div>
        </motion.div>

        {scoreGlowKey > 0 && (
          <motion.div
            key={`sg-${scoreGlowKey}`}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 0.45, 0], scale: [0.9, 1.05, 1] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.38) 0%, transparent 68%)"
            }}
          />
        )}

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

        {powerUpGlowKey > 0 && (
          <motion.div
            key={`pg-${powerUpGlowKey}`}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0.88, 1.07, 1] }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.5) 0%, transparent 62%)"
            }}
          />
        )}

        {ultimateFxKey > 0 && ultimateFx ? (
          <>
            <motion.div
              key={`ug-${ultimateFxKey}`}
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0, scale: 0.86 }}
              animate={{ opacity: [0, 0.66, 0], scale: [0.86, 1.08, 1] }}
              transition={{ duration: 0.62, ease: "easeOut" }}
              style={{
                background: `radial-gradient(ellipse at 50% 50%, ${ultimateFx.tint} 0%, transparent 64%)`
              }}
            />
            <motion.div
              key={`ur-${ultimateFxKey}`}
              className="pointer-events-none absolute inset-[-6px] rounded-[1.35rem] border-2"
              style={{ borderColor: ultimateFx.ring }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: [0, 0.95, 0], scale: [0.92, 1.05, 1.1] }}
              transition={{ duration: 0.64, ease: "easeOut" }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
