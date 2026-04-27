"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStreakEffectVisuals, type StreakEffectId } from "@/lib/cosmetics";
import { RankBadge } from "@/components/rank-badge";

type HitType = "normal" | "streak" | "ultimate";
type HitEffectId = "none" | "lightning_strike" | "fire_burst" | "pixel_glitch";

function formatDamageLabel(amount: number, hitType: HitType, flashTier: number) {
  if (hitType === "ultimate" || flashTier >= 2) return `-${Math.round(amount)} CRIT`;
  if (flashTier > 0) return `-${Math.round(amount)} FAST`;
  if (hitType === "streak") return `-${Math.round(amount)} STREAK`;
  return `-${Math.round(amount)}`;
}

type PlayerPanelProps = {
  label: string;
  score: number;
  rating?: number;
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
  ultimateFxType?: "rapid_fire" | "system_corrupt" | "perfect_sequence" | "overpower" | "shield" | "double" | null;
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
  /** Flash Overclock tier on the attacker's last hit (0 = none) — scales floating damage pop. */
  damageFlashTier?: number;
  /** Equipped cosmetic hit effect from the attacker. Visual only. */
  hitEffect?: HitEffectId | string;
  /** Whether this player's ultimate is currently ready. */
  ultimateReady?: boolean;
  /** One-shot key: pulse when ultimate becomes ready. */
  ultReadyCueKey?: number;
  /** Status effects for richer ultimate visibility. */
  overclockUntil?: number;
  blackoutUntil?: number;
  shadowCorruptUntil?: number;
  shadowCorruptStacks?: number;
  architectUntil?: number;
  architectMarks?: number;
  architectSequenceStreak?: number;
  opponentArchitectUntil?: number;
  opponentArchitectMarks?: number;
  opponentArchitectSequenceStreak?: number;
  titanOverpowerUntil?: number;
  titanStreak?: number;
  titanBreakArmed?: boolean;
  opponentTitanOverpowerUntil?: number;
  opponentTitanStreak?: number;
  opponentTitanBreakArmed?: boolean;
  fortressUntil?: number;
  fortressBlocksRemaining?: number;
  infernoPendingUntil?: number;
  infernoStacks?: number;
  ultimateQuestionsLeft?: number;
  ultimateName?: string;
};

function HitEffectBurst({ effect }: { effect: HitEffectId | string | undefined }) {
  if (!effect || effect === "none") return null;

  if (effect === "lightning_strike") {
    return (
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1 z-10 h-24 w-28 -translate-x-1/2"
        initial={{ opacity: 0, scale: 0.7, y: -8 }}
        animate={{ opacity: [0, 1, 0.95, 0], scale: [0.7, 1.08, 1, 0.94], y: [-8, 1, 6, 13] }}
        transition={{ duration: 0.58, ease: "easeOut" }}
      >
        <motion.div
          className="absolute left-1/2 top-10 h-16 w-16 -translate-x-1/2 rounded-full border border-cyan-200/75"
          initial={{ opacity: 0.75, scale: 0.28 }}
          animate={{ opacity: [0.75, 0.42, 0], scale: [0.28, 1.1, 1.55] }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        />
        <div className="absolute left-12 top-0 h-20 w-2 rotate-[18deg] rounded-full bg-cyan-100 shadow-[0_0_22px_rgba(125,211,252,1)]" />
        <div className="absolute left-6 top-9 h-12 w-2 -rotate-[34deg] rounded-full bg-yellow-100 shadow-[0_0_18px_rgba(253,224,71,0.95)]" />
        <div className="absolute left-16 top-11 h-10 w-1.5 rotate-[48deg] rounded-full bg-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.85)]" />
      </motion.div>
    );
  }

  if (effect === "fire_burst") {
    return (
      <motion.div
        className="pointer-events-none absolute left-1/2 top-0 z-10 h-28 w-32 -translate-x-1/2"
        initial={{ opacity: 0, scale: 0.42, y: 4 }}
        animate={{ opacity: [0, 1, 0.9, 0], scale: [0.42, 1.08, 1.18, 1.32], y: [4, -2, -5, -10] }}
        transition={{ duration: 0.64, ease: "easeOut" }}
      >
        <motion.div
          className="absolute left-1/2 top-10 h-20 w-20 -translate-x-1/2 rounded-full"
          initial={{ scale: 0.25, opacity: 0 }}
          animate={{ scale: [0.25, 1.05, 1.68], opacity: [0, 0.95, 0] }}
          transition={{ duration: 0.56, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(254,240,138,0.98) 16%, rgba(251,146,60,0.8) 34%, rgba(251,113,133,0.5) 54%, rgba(127,29,29,0) 76%)",
            boxShadow: "0 0 32px rgba(251,146,60,0.55)",
          }}
        />
        <motion.div
          className="absolute left-1/2 top-12 h-24 w-24 -translate-x-1/2 rounded-full border-2 border-orange-200/85"
          initial={{ scale: 0.22, opacity: 0.95 }}
          animate={{ scale: [0.22, 1.12, 1.58], opacity: [0.95, 0.42, 0] }}
          transition={{ duration: 0.44, ease: "easeOut" }}
        />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((spark) => {
          const angle = (spark / 8) * Math.PI * 2;
          const x = Math.round(Math.cos(angle) * 42);
          const y = Math.round(Math.sin(angle) * 28) - 8;
          return (
            <motion.span
              key={spark}
              className="absolute left-1/2 top-14 h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.9)]"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], x, y, scale: [0.6, 1, 0.25] }}
              transition={{ duration: 0.58, ease: "easeOut", delay: spark * 0.018 }}
            />
          );
        })}
      </motion.div>
    );
  }

  if (effect === "pixel_glitch") {
    return (
      <motion.div
        className="pointer-events-none absolute left-1/2 top-2 z-10 h-20 w-32 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.85, 0], x: [0, -6, 7, -3, 0] }}
        transition={{ duration: 0.56, ease: "linear" }}
      >
        <span className="absolute left-2 top-1 h-3 w-20 bg-cyan-300/90 shadow-[0_0_16px_rgba(34,211,238,0.85)]" />
        <span className="absolute left-12 top-8 h-3 w-16 bg-fuchsia-300/85 shadow-[0_0_16px_rgba(217,70,239,0.8)]" />
        <span className="absolute left-0 top-14 h-2.5 w-24 bg-white/78" />
        <span className="absolute left-20 top-4 h-10 w-4 bg-lime-300/70 shadow-[0_0_12px_rgba(190,242,100,0.7)]" />
      </motion.div>
    );
  }

  return null;
}

export function PlayerPanel({
  label,
  score,
  rating,
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
  damageFlashTier = 0,
  hitEffect = "none",
  ultimateReady = false,
  ultReadyCueKey = 0,
  overclockUntil = 0,
  blackoutUntil = 0,
  shadowCorruptUntil = 0,
  shadowCorruptStacks = 0,
  architectUntil = 0,
  architectMarks = 0,
  architectSequenceStreak = 0,
  opponentArchitectUntil = 0,
  opponentArchitectMarks = 0,
  opponentArchitectSequenceStreak = 0,
  titanOverpowerUntil = 0,
  titanStreak = 0,
  titanBreakArmed = false,
  opponentTitanOverpowerUntil = 0,
  opponentTitanStreak = 0,
  opponentTitanBreakArmed = false,
  fortressUntil = 0,
  fortressBlocksRemaining = 0,
  infernoPendingUntil = 0,
  infernoStacks = 0,
  ultimateQuestionsLeft = 0,
  ultimateName,
}: PlayerPanelProps) {
  const streakVisuals = getStreakEffectVisuals(streakEffect);

  const ultimateFxByType: Record<NonNullable<PlayerPanelProps["ultimateFxType"]>, { tint: string; ring: string }> = {
    rapid_fire: { tint: "rgba(250,204,21,0.46)", ring: "rgba(252,211,77,0.88)" },
    system_corrupt: { tint: "rgba(167,139,250,0.46)", ring: "rgba(196,181,253,0.85)" },
    perfect_sequence: { tint: "rgba(251,191,36,0.44)", ring: "rgba(253,230,138,0.9)" },
    overpower: { tint: "rgba(245,158,11,0.42)", ring: "rgba(245,158,11,0.92)" },
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

  const damagePopScale = 1 + Math.max(0, damageFlashTier - 1) * 0.12;

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
  const corruptActive = shadowCorruptUntil > now;
  const corruptSecondsLeft = corruptActive ? Math.max(0, Math.ceil((shadowCorruptUntil - now) / 1000)) : 0;
  const architectActive = architectUntil > now;
  const architectThreatening = opponentArchitectUntil > now;
  const titanActive = (titanOverpowerUntil ?? 0) > now;
  const titanThreatening = (opponentTitanOverpowerUntil ?? 0) > now;
  const fortressActive = fortressUntil > now;
  const infernoArmed = infernoPendingUntil > now;
  const infernoGlow = Math.min(0.75, 0.2 + infernoStacks * 0.08);

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
                    STORED {fortressBlocksRemaining}
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

            {/* Inferno blaze cue */}
            {infernoArmed ? (
              <motion.div
                key={`inferno-armed-${infernoPendingUntil}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mt-1 flex items-center justify-center"
              >
                <span className="rounded-full border border-rose-300/40 bg-rose-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-200 shadow-[0_0_18px_rgba(251,113,133,0.14)]">
                  BLAZE x{Math.max(0, infernoStacks)}
                </span>
              </motion.div>
            ) : null}

            {ultimateQuestionsLeft > 0 ? (
              <div className="mt-1 flex items-center justify-center">
                <span className="rounded-full border border-indigo-300/35 bg-indigo-950/60 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-100">
                  {`${ultimateName ? `${ultimateName} ` : ""}${ultimateQuestionsLeft}s`}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <motion.div
          key={`${pulseKey}-${hitKey}`}
          initial={{ scale: 1 }}
          animate={{
            x: latestDamage && latestDamage > 0 ? [0, -3, 3, 0] : 0,
            scale: latestDamage && latestDamage > 0 ? [1, 0.99, 1] : highlighted ? [1, 1.04, 1] : ultimateReady ? [1, 1.018, 1] : 1,
            boxShadow: ultimateReady
              ? [
                  "0 0 14px rgba(52,211,153,0.12)",
                  "0 0 34px rgba(52,211,153,0.3)",
                  "0 0 14px rgba(52,211,153,0.12)"
                ]
              : highlighted
              ? [
                  "0 0 0 rgba(56, 189, 248, 0)",
                  "0 0 24px rgba(56, 189, 248, 0.28)",
                  "0 0 0 rgba(56, 189, 248, 0)"
                ]
              : "0 0 0 rgba(56, 189, 248, 0)"
          }}
          transition={{ duration: latestDamage && latestDamage > 0 ? 0.18 : ultimateReady ? 1.1 : 0.45, repeat: ultimateReady && !(latestDamage && latestDamage > 0) ? Number.POSITIVE_INFINITY : 0, ease: "easeOut" }}
          className="q-card-subtle w-full min-h-[14rem] rounded-2xl p-3 text-center sm:min-h-[15.25rem] sm:p-4"
        >
          <p className="truncate px-1 text-xs uppercase tracking-[0.2em] text-slate-400/70">{label}</p>
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
            {typeof hp === "number" ? (
              <p className={`text-[10px] tabular-nums ${hp <= 20 ? "text-rose-300" : "text-slate-600"}`}>
                {Math.max(0, Math.round(hp))}/{Math.max(1, Math.round(maxHp))} HP
              </p>
            ) : null}
          </div>
          <motion.div
            className="mt-2 flex h-24 items-center justify-center sm:h-28"
            animate={{ scale: ultimateReady ? [1, 1.04, 1] : [1, 1.015, 1] }}
            transition={{ duration: ultimateReady ? 1.05 : 2.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            {avatar ? (
              <span className="text-6xl drop-shadow-[0_0_24px_rgba(34,211,238,0.25)] sm:text-7xl" aria-hidden="true">
                {avatar}
              </span>
            ) : (
              <p className="text-4xl font-bold text-white tabular-nums sm:text-5xl">{score}</p>
            )}
          </motion.div>
          <div className="mt-2 flex items-center justify-center">
            <p className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 text-2xl font-black text-white tabular-nums sm:text-3xl">{score}</p>
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
              style={{ background: fortressActive ? "rgba(56,189,248,0.42)" : "rgba(255,255,255,0.5)" }}
            />
            <motion.div
              key={`sfr-${shieldBlockFlashKey}`}
              className={`pointer-events-none absolute inset-[-6px] rounded-[1.35rem] border-2 ${fortressActive ? "border-sky-300/85" : "border-emerald-200/80"}`}
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
            <>
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
              <motion.div
                key="rapid-streaks"
                className="pointer-events-none absolute inset-y-2 left-1 w-1.5 rounded-full opacity-70"
                animate={{ backgroundPosition: ["0px 0px", "0px 80px"] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: "linear" }}
                style={{
                  background:
                    "repeating-linear-gradient(180deg, transparent 0px, transparent 6px, rgba(250,204,21,0.45) 6px, rgba(250,204,21,0.45) 8px)"
                }}
              />
              <motion.div
                className="pointer-events-none absolute inset-y-2 right-1 w-1.5 rounded-full opacity-70"
                animate={{ backgroundPosition: ["0px 0px", "0px -80px"] }}
                transition={{ duration: 0.4, repeat: Infinity, ease: "linear" }}
                style={{
                  background:
                    "repeating-linear-gradient(180deg, transparent 0px, transparent 5px, rgba(253,224,71,0.35) 5px, rgba(253,224,71,0.35) 7px)"
                }}
              />
            </>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {infernoArmed ? (
            <motion.div
              key="inferno-aura"
              className="pointer-events-none absolute inset-0 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.1, infernoGlow, 0.16, infernoGlow * 0.9, 0.1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.95, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background:
                  "radial-gradient(ellipse at 50% 38%, rgba(251,113,133,0.22) 0%, rgba(251,146,60,0.2) 35%, rgba(2,6,23,0) 68%)"
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

        <AnimatePresence>
          {corruptActive ? (
            <>
              <motion.div
                key="corrupt-overlay"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.06, 0.18, 0.08, 0.16, 0.06] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 35%, rgba(167,139,250,0.20) 0%, rgba(124,58,237,0.12) 42%, transparent 70%)"
                }}
              />
              <motion.div
                key="corrupt-scan"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.06, 0.16, 0.08, 0.14, 0.06], x: [0, 2, -1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.95, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background:
                    "repeating-linear-gradient(180deg, rgba(2,6,23,0.08) 0px, rgba(2,6,23,0.08) 6px, rgba(167,139,250,0.12) 6px, rgba(167,139,250,0.12) 8px)",
                  mixBlendMode: "screen" as const
                }}
              />
              {corruptSecondsLeft > 0 ? (
                <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-violet-300/35 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-violet-200 shadow-[0_0_18px_rgba(167,139,250,0.16)]">
                  JAM {corruptSecondsLeft}s
                </div>
              ) : null}
            </>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {architectActive ? (
            <>
              <motion.div
                key="architect-aura"
                className="pointer-events-none absolute inset-[-4px] rounded-[1.35rem] border"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.18, 0.46, 0.26, 0.44, 0.18] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  borderColor: "rgba(251,191,36,0.45)",
                  boxShadow: "0 0 26px rgba(251,191,36,0.16), inset 0 0 14px rgba(251,191,36,0.10)"
                }}
              />
              <motion.div
                key="architect-grid"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.05, 0.12, 0.06, 0.11, 0.05] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background:
                    "linear-gradient(90deg, rgba(251,191,36,0.10) 1px, transparent 1px), linear-gradient(180deg, rgba(251,191,36,0.08) 1px, transparent 1px)",
                  backgroundSize: "26px 26px",
                  mixBlendMode: "screen" as const
                }}
              />
              <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-amber-300/30 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.14)]">
                SEQ {Math.max(0, architectSequenceStreak)}/3 · MARKS {Math.max(0, architectMarks)}
              </div>
            </>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {architectThreatening ? (
            <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-amber-300/25 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/90">
              MARKED x{Math.max(0, opponentArchitectMarks)} · {Math.max(0, opponentArchitectSequenceStreak)}/3
            </div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {titanActive ? (
            <>
              <motion.div
                key="titan-aura"
                className="pointer-events-none absolute inset-[-4px] rounded-[1.35rem] border"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.18, 0.54, 0.28, 0.5, 0.18] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  borderColor: "rgba(245,158,11,0.55)",
                  boxShadow: "0 0 30px rgba(245,158,11,0.18), inset 0 0 16px rgba(245,158,11,0.12)"
                }}
              />
              <motion.div
                key="titan-cracks"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.05, 0.14, 0.07, 0.13, 0.05] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background:
                    "repeating-linear-gradient(135deg, rgba(245,158,11,0.10) 0px, rgba(245,158,11,0.10) 2px, rgba(2,6,23,0) 2px, rgba(2,6,23,0) 14px)",
                  mixBlendMode: "screen" as const
                }}
              />
              <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-amber-300/30 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.16)]">
                OVERPOWER {Math.max(0, titanStreak ?? 0)}/2{titanBreakArmed ? " · BREAK" : ""}
              </div>
            </>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {titanThreatening ? (
            <div className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-amber-300/25 bg-slate-950/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/90">
              TITAN {Math.max(0, opponentTitanStreak ?? 0)}/2{opponentTitanBreakArmed ? " · BREAK" : ""}
            </div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {fortressActive ? (
            <>
              <motion.div
                key="aegis-aura"
                className="pointer-events-none absolute inset-[-4px] rounded-[1.35rem] border border-sky-300/45"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.25, 0.62, 0.32, 0.6, 0.25] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ boxShadow: "0 0 22px rgba(56,189,248,0.22), inset 0 0 12px rgba(56,189,248,0.2)" }}
              />
              <motion.div
                key="aegis-core"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.06, 0.2, 0.08, 0.18, 0.06] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 38%, rgba(125,211,252,0.22) 0%, rgba(56,189,248,0.14) 45%, transparent 70%)"
                }}
              />
            </>
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
              style={{
                background: fortressActive
                  ? "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.45) 0%, rgba(2,6,23,0.25) 65%)"
                  : hitPalette.flash
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {fortressActive && hitKey > 0 ? (
            <motion.div
              key={`aegis-ripple-${hitKey}`}
              className="pointer-events-none absolute inset-[10%] rounded-[1rem] border border-sky-300/80"
              initial={{ opacity: 0.55, scale: 0.84 }}
              animate={{ opacity: [0.55, 0.28, 0], scale: [0.84, 1.06, 1.16] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {latestDamage !== null && latestDamage > 0 && hitKey > 0 ? (
            <HitEffectBurst key={`hit-effect-${hitKey}`} effect={hitEffect} />
          ) : null}
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
                    ? [
                        0.95 * damagePopScale,
                        (1.2 + hitIntensity * 0.25) * damagePopScale,
                        1.05 * damagePopScale,
                        0.98 * damagePopScale
                      ]
                    : hitType === "streak"
                      ? [
                          0.82 * damagePopScale,
                          (1.14 + hitIntensity * 0.18) * damagePopScale,
                          1.02 * damagePopScale,
                          0.97 * damagePopScale
                        ]
                      : [
                          0.74 * damagePopScale,
                          (1.08 + hitIntensity * 0.14) * damagePopScale,
                          1 * damagePopScale,
                          0.96 * damagePopScale
                        ]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.78, ease: "easeOut" }}
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-black shadow-lg ${
                  damageFlashTier > 0
                    ? "border-amber-300/70 bg-amber-950/95 text-amber-100"
                    : `${hitPalette.badgeBorder} ${hitPalette.badgeBg} ${hitPalette.badgeText}`
                }`}
              >
                {damageFlashTier > 0 ? <span className="text-amber-300">⚡</span> : null}-{latestDamage}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
