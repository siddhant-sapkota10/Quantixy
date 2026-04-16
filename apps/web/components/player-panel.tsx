"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStreakEffectVisuals, type StreakEffectId } from "@/lib/cosmetics";
import { RankBadge } from "@/components/rank-badge";

type HitType = "normal" | "streak" | "ultimate";

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
  /** Visual classification for the latest hit (affects flash + damage number). */
  hitType?: HitType;
  /** 0..1 intensity multiplier (affects flash strength + damage number scale). */
  hitIntensity?: number;
  /** One-shot key: pulse when ultimate becomes ready. */
  ultReadyCueKey?: number;
  /** Status effects for richer ultimate visibility. */
  overclockUntil?: number;
  blackoutUntil?: number;
  fortressUntil?: number;
  fortressBlocksRemaining?: number;
  infernoPendingUntil?: number;
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
  hitType = "normal",
  hitIntensity = 0.35,
  ultReadyCueKey = 0,
  overclockUntil = 0,
  blackoutUntil = 0,
  fortressUntil = 0,
  fortressBlocksRemaining = 0,
  infernoPendingUntil = 0,
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

  // HP animation: smooth drop + delayed "damage trail" ghost bar.
  const [hpFrontPercent, setHpFrontPercent] = useState(hpPercent);
  const [hpTrailPercent, setHpTrailPercent] = useState(hpPercent);
  const trailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showHp) return;
    setHpFrontPercent(hpPercent);
    if (trailTimeoutRef.current) clearTimeout(trailTimeoutRef.current);
    // trail lags behind slightly to show damage chunk
    trailTimeoutRef.current = setTimeout(() => setHpTrailPercent(hpPercent), 120);
    return () => {
      if (trailTimeoutRef.current) clearTimeout(trailTimeoutRef.current);
    };
  }, [hpPercent, showHp]);

  const hitPalette = useMemo(() => {
    if (hitType === "ultimate") {
      return {
        flash: "rgba(255,255,255,0.55)",
        barFlash: "rgba(250,204,21,0.95)",
        badgeBorder: "border-amber-300/60",
        badgeBg: "bg-amber-950/90",
        badgeText: "text-amber-200",
      };
    }
    if (hitType === "streak") {
      return {
        flash: "rgba(251,191,36,0.45)",
        barFlash: "rgba(251,191,36,0.9)",
        badgeBorder: "border-amber-400/50",
        badgeBg: "bg-amber-950/80",
        badgeText: "text-amber-200",
      };
    }
    return {
      flash: "rgba(239,68,68,0.48)",
      barFlash: "rgba(255,255,255,0.55)",
      badgeBorder: "border-rose-500/50",
      badgeBg: "bg-rose-950/90",
      badgeText: "text-rose-300",
    };
  }, [hitType]);

  const now = Date.now();
  const rapidActive = overclockUntil > now;
  const jammedActive = blackoutUntil > now;
  const fortressActive = fortressUntil > now && fortressBlocksRemaining > 0;
  const infernoArmed = infernoPendingUntil > now;

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
        {/* Ultimate ready moment — one-shot pulse */}
        <AnimatePresence>
          {ultReadyCueKey > 0 ? (
            <motion.div
              key={`ult-ready-${ultReadyCueKey}`}
              className="pointer-events-none absolute inset-[-10px] z-20 rounded-[1.6rem] border"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: [0, 1, 0], scale: [0.96, 1.03, 1.08] }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              style={{
                borderColor: "rgba(52,211,153,0.55)",
                boxShadow: "0 0 28px rgba(52,211,153,0.20)"
              }}
            />
          ) : null}
        </AnimatePresence>

        {/* HP bar — shown above the main card */}
        {showHp ? (
          <div className="mb-1.5 px-0.5">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">HP</p>
              <p className={`text-[9px] font-bold tabular-nums ${hpPercent <= 30 ? "text-rose-400" : hpPercent <= 60 ? "text-amber-400" : "text-emerald-400"}`}>
                {Math.max(0, Math.round(hp ?? 0))}
              </p>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
              {/* Damage trail (ghost) */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-rose-500/65"
                animate={{ width: `${hpTrailPercent}%` }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              />
              {/* Front HP */}
              <motion.div
                className={`relative h-full rounded-full transition-colors duration-500 ${hpBarColor}`}
                animate={{ width: `${hpFrontPercent}%` }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              />
              {/* Bar flash on hit */}
              <AnimatePresence>
                {hitKey > 0 && latestDamage && latestDamage > 0 ? (
                  <motion.div
                    key={`hpflash-${hitKey}`}
                    className="pointer-events-none absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.65, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    style={{ background: hitPalette.barFlash, mixBlendMode: "soft-light" as const }}
                  />
                ) : null}
              </AnimatePresence>

              {/* Guardian fortress overlay + blocks */}
              {fortressActive ? (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-sky-300/55 shadow-[0_0_10px_rgba(56,189,248,0.28)]" />
                  <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-sky-300/40 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-sky-200">
                    {fortressBlocksRemaining} BLOCKS
                  </div>
                  {/* Crack effect on block */}
                  <AnimatePresence>
                    {shieldBlockFlashKey > 0 ? (
                      <motion.div
                        key={`crack-${shieldBlockFlashKey}`}
                        className="pointer-events-none absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        style={{
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.75) 25%, transparent 40%, rgba(56,189,248,0.55) 60%, transparent 75%, rgba(56,189,248,0.75) 100%)",
                          mixBlendMode: "screen" as const
                        }}
                      />
                    ) : null}
                  </AnimatePresence>
                </>
              ) : null}
            </div>

            {/* Inferno armed cue */}
            {infernoArmed ? (
              <motion.div
                key={`inferno-armed-${infernoPendingUntil}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mt-1 flex items-center justify-center"
              >
                <span className="rounded-full border border-rose-300/40 bg-rose-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-200 shadow-[0_0_18px_rgba(251,113,133,0.14)]">
                  NEXT HIT EMPOWERED
                </span>
              </motion.div>
            ) : null}
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
          <p className="truncate px-1 text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
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

        {/* Persistent ultimate auras (active / jam) */}
        <AnimatePresence>
          {rapidActive ? (
            <motion.div
              key="rapid-aura"
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.1, 0.28, 0.12, 0.26, 0.1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background:
                  "radial-gradient(ellipse at 50% 35%, rgba(250,204,21,0.22) 0%, transparent 62%)"
              }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {jammedActive ? (
            <motion.div
              key="jam-overlay"
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.22, 0.12, 0.18, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.65, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background:
                  "repeating-linear-gradient(180deg, rgba(15,23,42,0.08) 0px, rgba(15,23,42,0.08) 5px, rgba(167,139,250,0.12) 5px, rgba(167,139,250,0.12) 7px)"
              }}
            />
          ) : null}
        </AnimatePresence>

        {/* Hit flash — red overlay when this player takes damage */}
        <AnimatePresence>
          {hitKey > 0 && (
            <motion.div
              key={`hit-${hitKey}`}
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, Math.min(0.72, 0.28 + hitIntensity * 0.65), 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{ background: hitPalette.flash }}
            />
          )}
        </AnimatePresence>

        {/* Floating damage number */}
        <AnimatePresence>
          {latestDamage !== null && latestDamage > 0 && hitKey > 0 && (
            <motion.div
              key={`dmg-${hitKey}`}
              className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap"
              initial={{ opacity: 0, y: 0, scale: hitType === "ultimate" ? 0.95 : hitType === "streak" ? 0.82 : 0.74 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: hitType === "ultimate" ? -40 : hitType === "streak" ? -36 : -30,
                scale:
                  hitType === "ultimate"
                    ? [0.95, 1.2 + hitIntensity * 0.25, 1.05, 0.98]
                    : hitType === "streak"
                      ? [0.82, 1.14 + hitIntensity * 0.18, 1.02, 0.97]
                      : [0.74, 1.08 + hitIntensity * 0.14, 1, 0.96]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.78, ease: "easeOut" }}
            >
              <span className={`rounded-full border ${hitPalette.badgeBorder} ${hitPalette.badgeBg} px-2.5 py-1 text-sm font-black ${hitPalette.badgeText} shadow-lg`}>
                -{latestDamage}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
