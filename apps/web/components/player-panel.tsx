"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getStreakEffectVisuals, type StreakEffectId } from "@/lib/cosmetics";
import { RankBadge } from "@/components/rank-badge";

type PlayerPanelProps = {
  label: string;
  score: number;
  rating?: number;
  strikes?: number;
  eliminated?: boolean;
  avatar?: string;
  streakLabel?: string | null;
  streakLevel?: "fire" | "unstoppable" | null;
  /** Equipped cosmetic streak effect — visual only, no gameplay effect. */
  streakEffect?: StreakEffectId;
  fastActive?: boolean;
  highlighted?: boolean;
  pulseKey: number;
  scoreGlowKey?: number;
  shieldBlockFlashKey?: number;
  powerUpGlowKey?: number;
  ultimateFxKey?: number;
  ultimateFxType?: "rapid_fire" | "jam" | "shield" | "double" | null;
  /** Current HP (0–100). When undefined, HP bar is hidden. */
  hp?: number;
  /** Max HP for the bar calculation. Defaults to 100. */
  maxHp?: number;
  /** Increment to trigger a red hit-flash + shake animation. */
  hitKey?: number;
  /** Damage taken on the latest hit — shows as a floating "-X HP" label. */
  latestDamage?: number | null;
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
  streakEffect,
  fastActive = false,
  highlighted = false,
  pulseKey,
  scoreGlowKey = 0,
  shieldBlockFlashKey = 0,
  powerUpGlowKey = 0,
  ultimateFxKey = 0,
  ultimateFxType = null,
  hp,
  maxHp = 100,
  hitKey = 0,
  latestDamage = null,
}: PlayerPanelProps) {
  const streakVisuals = getStreakEffectVisuals(streakEffect);

  const ultimateFxByType: Record<NonNullable<PlayerPanelProps["ultimateFxType"]>, { tint: string; ring: string }> = {
    rapid_fire: { tint: "rgba(250,204,21,0.45)", ring: "rgba(250,204,21,0.82)" },
    jam: { tint: "rgba(167,139,250,0.48)", ring: "rgba(167,139,250,0.82)" },
    shield: { tint: "rgba(34,211,238,0.42)", ring: "rgba(34,211,238,0.8)" },
    double: { tint: "rgba(251,113,133,0.48)", ring: "rgba(251,113,133,0.82)" }
  };
  const ultimateFx = ultimateFxType ? ultimateFxByType[ultimateFxType] : null;

  const showHp = typeof hp === "number";
  const hpPercent = showHp ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 100;
  const hpBarColor =
    hpPercent > 60 ? "bg-emerald-400" :
    hpPercent > 30 ? "bg-amber-400" :
    "bg-rose-500";

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
              className={`text-xs font-bold uppercase tracking-[0.25em] ${streakVisuals.colorClass}`}
            >
              {streakLabel} {streakLevel === "unstoppable" ? streakVisuals.maxIcon : streakVisuals.icon}
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

      <div className="relative w-full">
        {/* HP bar — shown above the main card */}
        {showHp ? (
          <div className="mb-1.5 px-0.5">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">HP</p>
              <p className={`text-[9px] font-bold tabular-nums ${hpPercent <= 30 ? "text-rose-400" : hpPercent <= 60 ? "text-amber-400" : "text-emerald-400"}`}>
                {Math.max(0, Math.round(hp ?? 0))}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className={`h-full rounded-full transition-colors duration-500 ${hpBarColor}`}
                animate={{ width: `${hpPercent}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
          </div>
        ) : null}

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
          {/* Rank badge */}
          <div className="mt-1.5 flex min-h-[1.25rem] items-center justify-center">
            {typeof rating === "number" ? (
              <RankBadge rating={rating} size="md" />
            ) : (
              <span className="invisible text-[11px]">—</span>
            )}
          </div>
          {/* Supporting stats */}
          <div className="mt-1 flex items-center justify-center gap-2">
            {typeof rating === "number" ? (
              <p className="text-[10px] tabular-nums text-slate-600">{rating}</p>
            ) : null}
            <p className={`text-[10px] ${eliminated ? "text-rose-400" : "text-slate-600"}`}>
              {strikes}/3
            </p>
          </div>
          <div className="mt-2 flex h-11 items-center justify-center sm:h-12">
            <p className="text-3xl font-bold text-white tabular-nums sm:text-4xl">{score}</p>
          </div>
        </motion.div>

        {/* Score glow */}
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

        {/* Shield block flash */}
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

        {/* Power-up glow */}
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

        {/* Ultimate FX */}
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

        {/* Hit flash — red overlay when this player takes damage */}
        <AnimatePresence>
          {hitKey > 0 && (
            <motion.div
              key={`hit-${hitKey}`}
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0.3, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              style={{ background: "rgba(239,68,68,0.48)" }}
            />
          )}
        </AnimatePresence>

        {/* Floating damage number */}
        <AnimatePresence>
          {latestDamage !== null && latestDamage > 0 && hitKey > 0 && (
            <motion.div
              key={`dmg-${hitKey}`}
              className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap"
              initial={{ opacity: 0, y: 0, scale: 0.7 }}
              animate={{ opacity: [0, 1, 1, 0], y: -32, scale: [0.7, 1.1, 1, 0.95] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.82, ease: "easeOut" }}
            >
              <span className="rounded-full border border-rose-500/50 bg-rose-950/90 px-2.5 py-1 text-sm font-black text-rose-300 shadow-lg">
                -{latestDamage} HP
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
