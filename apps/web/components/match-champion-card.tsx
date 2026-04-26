"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getAvatar, type AvatarId } from "@/lib/avatars";
import { ULTIMATE_VFX, type UltimateType } from "@/lib/ultimate-vfx";
import { UltimateStatus } from "@/components/ultimate-status";
import { FloatingLabel, type FloatingLabelItem } from "@/components/animations/FloatingLabel";

type Side = "you" | "opponent";
type HitEffectId = "none" | "lightning_strike" | "fire_burst" | "pixel_glitch";

export type MatchChampionCardModel = {
  side: Side;
  playerName: string;
  avatarId: AvatarId;
  ultimateType: UltimateType;
  ultimateName: string;
  charge: number; // 0..100
  ready: boolean;
  used: boolean;
  implemented: boolean;
  // Active state timestamps (ms epoch). 0 if inactive.
  overclockUntil?: number;
  blackoutUntil?: number;
  shadowCorruptUntil?: number;
  shadowCorruptStacks?: number;
  architectUntil?: number;
  architectMarks?: number;
  architectSequenceStreak?: number;
  architectReady?: boolean;
  titanOverpowerUntil?: number;
  titanRecoveryUntil?: number;
  titanDamageReduction?: number;
  fortressUntil?: number;
  fortressBlocksRemaining?: number;
  fortressStoredDamage?: number;
  infernoPending?: boolean;
  infernoPendingUntil?: number;
  infernoStacks?: number;
  /** Flash Overclock: consecutive-correct damage stacks (server-synced). */
  flashOverclockStacks?: number;
  /** Seconds remaining for your active ultimate. */
  ultimateQuestionsLeft?: number;
  jammed?: boolean;
  burning?: boolean;
  /** Battle HUD: floating damage on this card when this player was just hit. */
  damageFloat?: { hitKey: number; amount: number; flashTier: number; hitEffect?: HitEffectId | string } | null;
  combatEvents?: FloatingLabelItem[];
};

type MatchChampionCardProps = {
  model: MatchChampionCardModel;
  variant?: "compact" | "battle";
  hp?: number;
  maxHp?: number;
};

const THEME: Record<AvatarId, { ring: string; glow: string; readyGlow: string; chip: string }> = {
  flash: {
    ring: "ring-amber-300/38",
    glow: "shadow-[0_0_24px_rgba(250,204,21,0.2)]",
    readyGlow: "shadow-[0_0_30px_rgba(250,204,21,0.34)]",
    chip: "border-amber-300/30 bg-amber-500/10 text-amber-100",
  },
  architect: {
    ring: "ring-amber-300/40",
    glow: "shadow-[0_0_26px_rgba(251,191,36,0.20)]",
    readyGlow: "shadow-[0_0_32px_rgba(251,191,36,0.36)]",
    chip: "border-amber-300/30 bg-amber-500/10 text-amber-100",
  },
  titan: {
    ring: "ring-amber-300/45",
    glow: "shadow-[0_0_26px_rgba(245,158,11,0.22)]",
    readyGlow: "shadow-[0_0_34px_rgba(245,158,11,0.40)]",
    chip: "border-amber-300/35 bg-amber-500/10 text-amber-100",
  },
  guardian: {
    ring: "ring-sky-300/35",
    glow: "shadow-[0_0_24px_rgba(56,189,248,0.18)]",
    readyGlow: "shadow-[0_0_28px_rgba(56,189,248,0.32)]",
    chip: "border-sky-300/25 bg-sky-500/10 text-sky-200",
  },
  inferno: {
    ring: "ring-rose-300/30",
    glow: "shadow-[0_0_24px_rgba(251,113,133,0.18)]",
    readyGlow: "shadow-[0_0_28px_rgba(251,113,133,0.32)]",
    chip: "border-rose-300/25 bg-rose-500/10 text-rose-200",
  },
  shadow: {
    ring: "ring-violet-300/30",
    glow: "shadow-[0_0_24px_rgba(167,139,250,0.18)]",
    readyGlow: "shadow-[0_0_28px_rgba(167,139,250,0.32)]",
    chip: "border-violet-300/25 bg-violet-500/10 text-violet-200",
  },
};

function portraitSrc(avatarId: AvatarId) {
  return `/assets/avatarCards/${avatarId}.png`;
}

function secondsLeft(until: number, now: number) {
  if (!until || until <= now) return 0;
  return Math.max(0, Math.ceil((until - now) / 100) / 10); // 0.1s precision
}

function HitEffectBurst({
  effect,
  align,
}: {
  effect: HitEffectId | string | undefined;
  align: "left" | "right";
}) {
  if (!effect || effect === "none") return null;

  if (effect === "lightning_strike") {
    return (
      <motion.div
        className={`pointer-events-none absolute top-1 z-10 h-12 w-10 ${align === "right" ? "right-2" : "left-2"}`}
        initial={{ opacity: 0, scale: 0.75, y: -4 }}
        animate={{ opacity: [0, 1, 0], scale: [0.75, 1.08, 0.95], y: [-4, 2, 8] }}
        transition={{ duration: 0.42, ease: "easeOut" }}
      >
        <div className="absolute left-4 top-0 h-12 w-1 rotate-[18deg] rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(125,211,252,0.9)]" />
        <div className="absolute left-2 top-5 h-7 w-1 -rotate-[32deg] rounded-full bg-yellow-200 shadow-[0_0_14px_rgba(253,224,71,0.75)]" />
      </motion.div>
    );
  }

  if (effect === "fire_burst") {
    return (
      <motion.div
        className={`pointer-events-none absolute top-3 z-10 h-14 w-14 rounded-full ${align === "right" ? "right-0" : "left-0"}`}
        initial={{ opacity: 0, scale: 0.35 }}
        animate={{ opacity: [0, 0.92, 0], scale: [0.35, 1.05, 1.45] }}
        transition={{ duration: 0.48, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(circle, rgba(254,240,138,0.95) 0%, rgba(251,113,133,0.58) 36%, rgba(127,29,29,0) 72%)",
        }}
      />
    );
  }

  if (effect === "pixel_glitch") {
    return (
      <motion.div
        className={`pointer-events-none absolute top-4 z-10 h-12 w-16 ${align === "right" ? "right-0" : "left-0"}`}
        initial={{ opacity: 0, x: 0 }}
        animate={{ opacity: [0, 1, 0], x: [0, -3, 4, -2, 0] }}
        transition={{ duration: 0.42, ease: "linear" }}
      >
        <span className="absolute left-2 top-1 h-2 w-10 bg-cyan-300/80 shadow-[0_0_12px_rgba(34,211,238,0.7)]" />
        <span className="absolute left-6 top-5 h-2 w-8 bg-fuchsia-300/75 shadow-[0_0_12px_rgba(217,70,239,0.65)]" />
        <span className="absolute left-0 top-8 h-1.5 w-12 bg-white/70" />
      </motion.div>
    );
  }

  return null;
}

export function MatchChampionCard({ model, variant = "compact", hp, maxHp = 100 }: MatchChampionCardProps) {
  const now = Date.now();
  const avatar = useMemo(() => getAvatar(model.avatarId), [model.avatarId]);
  const theme = THEME[model.avatarId];
  const vfx = ULTIMATE_VFX[model.ultimateType];

  const isActiveRapid = (model.overclockUntil ?? 0) > now;
  const isActiveJam = (model.blackoutUntil ?? 0) > now;
  const isActiveArchitect = (model.architectUntil ?? 0) > now;
  const isActiveCorrupt = (model.shadowCorruptUntil ?? 0) > now;
  const fortressBlocks = model.fortressBlocksRemaining ?? 0;
  const isActiveFortress = (model.fortressUntil ?? 0) > now;
  const isArmedInferno = Boolean(model.infernoPending) && (model.infernoPendingUntil ?? 0) > now;
  const infernoStacks = model.infernoStacks ?? 0;
  const questionsLeft = Math.max(0, model.ultimateQuestionsLeft ?? 0);
  const activeUntil = isActiveRapid
    ? model.overclockUntil ?? 0
    : isActiveCorrupt
      ? model.shadowCorruptUntil ?? 0
      : isActiveArchitect
        ? model.architectUntil ?? 0
        : isActiveFortress
          ? model.fortressUntil ?? 0
          : isArmedInferno
            ? model.infernoPendingUntil ?? 0
            : (model.titanOverpowerUntil ?? 0);

  const flashStacks = model.flashOverclockStacks ?? 0;
  const activeLabel = isActiveRapid
    ? `OVERCLOCK - ${questionsLeft || secondsLeft(model.overclockUntil ?? 0, now)}s${
        flashStacks > 0 ? ` - x${flashStacks}` : ""
      }`
    : isActiveCorrupt
      ? `NEURAL JAM - ${questionsLeft || secondsLeft(model.shadowCorruptUntil ?? 0, now)}s`
      : isActiveArchitect
        ? `PERFECT SEQUENCE - ${questionsLeft || secondsLeft(model.architectUntil ?? 0, now)}s${
            (model.architectMarks ?? 0) > 0 ? ` - MARKS x${model.architectMarks}` : ""
          }${
            (model.architectSequenceStreak ?? 0) > 0 ? ` - ${model.architectSequenceStreak}/3` : ""
          }`
      : isActiveJam
        ? `SIGNAL JAM - ${secondsLeft(model.blackoutUntil ?? 0, now)}s`
      : isActiveFortress
        ? `REFLECT BASTION - ${questionsLeft || secondsLeft(model.fortressUntil ?? 0, now)}s - STORED ${fortressBlocks}`
        : isArmedInferno
          ? `BLAZE SURGE - ${questionsLeft || secondsLeft(model.infernoPendingUntil ?? 0, now)}s - BURN x${infernoStacks}`
          : null;

  const ready = model.ready && !model.used && model.implemented;
  const ultChip =
    model.used ? "USED" : !model.implemented ? "SOON" : ready ? "ULT READY" : `${Math.round(model.charge)}%`;

  const chargePct = Math.max(0, Math.min(100, model.charge));
  const showReadyPulse = ready;
  const hpMax = Math.max(1, maxHp ?? 100);
  const hpSafe = typeof hp === "number" ? Math.max(0, Math.min(hpMax, hp)) : null;
  const hpPct = hpSafe === null ? null : Math.max(0, Math.min(100, (hpSafe / hpMax) * 100));
  const hpColor =
    hpPct === null
      ? "bg-slate-500/60"
      : hpPct > 60
        ? "bg-emerald-400"
        : hpPct > 30
          ? "bg-amber-400"
          : "bg-rose-500";
  const isOpponent = model.side === "opponent";

  if (variant === "battle") {
    return (
      <div
        className={`relative overflow-hidden rounded-[1.5rem] p-2.5 sm:p-3.5`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-85"
          style={{
            background: isOpponent
              ? "linear-gradient(110deg, rgba(251,113,133,0.12) 0%, rgba(15,23,42,0.2) 40%, rgba(251,113,133,0.04) 100%)"
              : "linear-gradient(250deg, rgba(56,189,248,0.12) 0%, rgba(15,23,42,0.2) 40%, rgba(56,189,248,0.04) 100%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: vfx.tint }} />

        {showReadyPulse ? (
          <div className={`pointer-events-none absolute inset-[-5px] rounded-[1.6rem] ring-1 ${theme.ring}`} />
        ) : null}

        <div
          className={`relative grid items-stretch gap-3 grid-cols-[minmax(0,1fr)_4.75rem] sm:${
            isOpponent ? "grid-cols-[6.75rem_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_6.75rem]"
          }`}
        >
          <FloatingLabel items={model.combatEvents ?? []} />
          {/* Mobile: always left-aligned + same ordering to avoid lopsided stacked HUD. */}
          <div className={`min-w-0 order-1 text-left sm:${isOpponent ? "order-2 text-right" : "order-1 text-left"}`}>
            <p className="truncate text-[0.85rem] font-black uppercase tracking-[0.06em] text-white sm:text-[1.02rem]">
              {avatar.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {model.playerName}
            </p>

            <div className={`mt-1.5 flex items-center gap-2 justify-start sm:${isOpponent ? "justify-end" : "justify-start"}`}>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${theme.chip}`}>
                {model.used ? "USED" : !model.implemented ? "SOON" : ready ? "READY" : `${Math.round(model.charge)}%`}
              </span>
              {/* Mobile: active label is noisy/truncated; keep it for larger screens */}
              {activeLabel ? (
                <span className="hidden truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300 sm:inline">
                  {activeLabel}
                </span>
              ) : null}
            </div>

            <p className="mt-1.5 hidden truncate text-[11px] text-slate-200 sm:block">
              <span className="font-semibold uppercase tracking-[0.16em] text-slate-400">Ultimate</span>{" "}
              <span className="font-semibold">{model.ultimateName}</span>
            </p>

            <div className="mt-2">
              <UltimateStatus
                avatarId={model.avatarId}
                ultimateType={avatar.ultimateId}
                ultimateName={model.ultimateName}
                charge={model.charge}
                ready={model.ready}
                used={model.used}
                activeUntil={activeUntil}
                remainingSeconds={questionsLeft}
                flashStacks={flashStacks}
                burnStacks={infernoStacks}
                architectNodes={model.architectMarks ?? 0}
                architectReady={model.architectReady ?? false}
                fortressStoredDamage={model.fortressStoredDamage ?? model.fortressBlocksRemaining ?? 0}
                jammed={Boolean(model.jammed)}
                burning={Boolean(model.burning)}
                titanRecovering={(model.titanRecoveryUntil ?? 0) > now}
                titanDamageReduction={model.titanDamageReduction ?? 0}
                compact
              />
            </div>

            {/* Mobile: hide charge bar to save vertical space (chip already shows %) */}
            <div className="mt-2.5 hidden sm:block">
              <div className={`mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500`}>
                <span>Charge</span>
                <span className="tabular-nums text-slate-300">{Math.round(model.charge)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-800/90">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${chargePct}%`,
                    background: ready ? vfx.accent : "rgba(148,163,184,0.58)",
                    boxShadow: ready ? `0 0 12px ${vfx.glow}` : "none",
                  }}
                />
              </div>
            </div>

            {hpPct !== null ? (
              <div className="relative mt-2">
                {model.damageFloat && model.damageFloat.amount > 0 && model.damageFloat.hitKey > 0 ? (
                  <HitEffectBurst
                    key={`hit-fx-${model.damageFloat.hitKey}`}
                    effect={model.damageFloat.hitEffect}
                    align={isOpponent ? "right" : "left"}
                  />
                ) : null}
                <AnimatePresence>
                  {model.damageFloat && model.damageFloat.amount > 0 && model.damageFloat.hitKey > 0 ? (
                    <motion.div
                      key={`dmg-${model.damageFloat.hitKey}`}
                      className={`pointer-events-none absolute -top-1 z-20 whitespace-nowrap sm:-top-2 ${isOpponent ? "right-0" : "left-0"}`}
                      initial={{ opacity: 0, y: 6, scale: 0.82 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        y: [6, -8, -22, -34],
                        scale: [
                          0.82,
                          1 + Math.max(0, model.damageFloat.flashTier - 1) * 0.12,
                          1 + Math.max(0, model.damageFloat.flashTier - 1) * 0.1,
                          0.95
                        ]
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.85, ease: "easeOut" }}
                    >
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black tabular-nums shadow-lg sm:px-2.5 sm:py-1 sm:text-sm ${
                          model.damageFloat.flashTier > 0
                            ? "border-amber-300/70 bg-amber-950/95 text-amber-100"
                            : "border-rose-400/55 bg-rose-950/95 text-rose-100"
                        }`}
                      >
                        {model.damageFloat.flashTier > 0 ? <span className="text-amber-300">⚡</span> : null}-
                        {Math.round(model.damageFloat.amount)}
                      </span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <span>HP</span>
                  <span className="tabular-nums text-slate-200">{Math.round(hpSafe ?? 0)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800/90 sm:h-2.5">
                  <div className={`h-full rounded-full transition-all duration-300 ${hpColor}`} style={{ width: `${hpPct}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <div className={`order-2 flex items-center justify-center sm:${isOpponent ? "order-1" : "order-2"}`}>
            <div className={`relative w-full max-w-[4.75rem] overflow-hidden rounded-[1.05rem] border border-white/15 bg-slate-900/80 shadow-[0_16px_36px_rgba(2,6,23,0.55)] ring-1 sm:max-w-[6.75rem] ${theme.ring}`}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-slate-950/45" />
              <div className="relative aspect-[3/4]">
                <Image
                  src={portraitSrc(model.avatarId)}
                  alt={`${avatar.name} portrait`}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 76px, 120px"
                  priority={false}
                />
              </div>
            </div>
          </div>
        </div>

        {model.avatarId === "shadow" && (isActiveCorrupt || isActiveJam || ready) ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] opacity-80"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.9) 35%, rgba(56,189,248,0.35) 55%, transparent 100%)",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/55 p-3 ${
        theme.glow
      } ${showReadyPulse ? theme.readyGlow : ""}`}
    >
      <FloatingLabel items={model.combatEvents ?? []} />
      {/* Subtle per-champion tint */}
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: vfx.tint }} />

      {/* Ready pulse ring */}
      {showReadyPulse ? (
        <div className={`pointer-events-none absolute inset-[-6px] rounded-[1.2rem] ring-2 ${theme.ring} animate-pulse`} />
      ) : null}

      <div className="relative flex items-center gap-3">
        <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 ring-1 ${theme.ring}`}>
          <Image
            src={portraitSrc(model.avatarId)}
            alt={`${avatar.name} portrait`}
            width={192}
            height={192}
            className="h-full w-full object-cover"
            priority={false}
          />
          {/* Active FX overlay */}
          {(isActiveRapid || isActiveFortress || isArmedInferno || isActiveCorrupt || isActiveJam) ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  isActiveCorrupt
                    ? "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.55) 0%, transparent 60%)"
                    : isActiveJam
                      ? "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.45) 0%, transparent 60%)"
                    : isActiveFortress
                      ? "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.45) 0%, transparent 60%)"
                      : isArmedInferno
                        ? "radial-gradient(circle at 50% 50%, rgba(251,113,133,0.52) 0%, transparent 60%)"
                        : "radial-gradient(circle at 50% 50%, rgba(250,204,21,0.52) 0%, transparent 60%)",
              }}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{avatar.name}</p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {model.playerName}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${theme.chip}`}>
              {ultChip}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-slate-200">
              <span className="text-slate-400">Ultimate:</span> {model.ultimateName}
            </p>
            {activeLabel ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-200/90">
                {activeLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-2">
            <UltimateStatus
              avatarId={model.avatarId}
              ultimateType={avatar.ultimateId}
              ultimateName={model.ultimateName}
              charge={model.charge}
              ready={model.ready}
              used={model.used}
              activeUntil={activeUntil}
              remainingSeconds={questionsLeft}
              flashStacks={flashStacks}
              burnStacks={infernoStacks}
              architectNodes={model.architectMarks ?? 0}
              architectReady={model.architectReady ?? false}
              fortressStoredDamage={model.fortressStoredDamage ?? model.fortressBlocksRemaining ?? 0}
              jammed={Boolean(model.jammed)}
              burning={Boolean(model.burning)}
              titanRecovering={(model.titanRecoveryUntil ?? 0) > now}
              titanDamageReduction={model.titanDamageReduction ?? 0}
            />
          </div>

          {hpPct !== null ? (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <span>HP</span>
                <span className="tabular-nums text-slate-200">{Math.round(hpSafe ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full transition-all duration-300 ${hpColor}`} style={{ width: `${hpPct}%` }} />
              </div>
            </div>
          ) : null}

          {/* Charge bar */}
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${chargePct}%`,
                background: ready ? vfx.accent : "rgba(148,163,184,0.55)",
                boxShadow: ready ? `0 0 12px ${vfx.glow}` : "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Glitch strip for Shadow */}
      {model.avatarId === "shadow" && (isActiveCorrupt || isActiveJam || ready) ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] opacity-80"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.9) 35%, rgba(56,189,248,0.35) 55%, transparent 100%)",
          }}
        />
      ) : null}
    </div>
  );
}
