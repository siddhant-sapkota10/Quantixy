"use client";

import Image from "next/image";
import { useMemo } from "react";
import { getAvatar, type AvatarId } from "@/lib/avatars";
import { ULTIMATE_VFX, type UltimateType } from "@/lib/ultimate-vfx";

type Side = "you" | "opponent";

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
  fortressUntil?: number;
  fortressBlocksRemaining?: number;
  infernoPending?: boolean;
  infernoPendingUntil?: number;
  infernoStacks?: number;
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

  const activeLabel = isActiveRapid
    ? `ACTIVE - ${secondsLeft(model.overclockUntil ?? 0, now)}s`
    : isActiveCorrupt
      ? `SYSTEM CORRUPT - ${secondsLeft(model.shadowCorruptUntil ?? 0, now)}s${
          (model.shadowCorruptStacks ?? 0) > 0 ? ` - x${model.shadowCorruptStacks}` : ""
        }`
      : isActiveArchitect
        ? `PERFECT SEQUENCE - ${secondsLeft(model.architectUntil ?? 0, now)}s${
            (model.architectMarks ?? 0) > 0 ? ` - MARKS x${model.architectMarks}` : ""
          }${
            (model.architectSequenceStreak ?? 0) > 0 ? ` - ${model.architectSequenceStreak}/3` : ""
          }`
      : isActiveJam
        ? `SIGNAL JAM - ${secondsLeft(model.blackoutUntil ?? 0, now)}s`
      : isActiveFortress
        ? `AEGIS DOMAIN - ${secondsLeft(model.fortressUntil ?? 0, now)}s - STORED ${fortressBlocks}`
        : isArmedInferno
          ? `BLAZE SURGE - ${secondsLeft(model.infernoPendingUntil ?? 0, now)}s - BURN x${infernoStacks}`
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
        className={`relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/78 p-3 sm:p-3.5 ${
          theme.glow
        } ${showReadyPulse ? theme.readyGlow : ""}`}
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
          className={`relative grid items-stretch gap-3 ${
            isOpponent
              ? "grid-cols-[5.75rem_minmax(0,1fr)] sm:grid-cols-[6.75rem_minmax(0,1fr)]"
              : "grid-cols-[minmax(0,1fr)_5.75rem] sm:grid-cols-[minmax(0,1fr)_6.75rem]"
          }`}
        >
          <div className={`min-w-0 ${isOpponent ? "order-2 text-right" : "order-1 text-left"}`}>
            <p className="truncate text-[0.95rem] font-black uppercase tracking-[0.06em] text-white sm:text-[1.02rem]">
              {avatar.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {model.playerName}
            </p>

            <div className={`mt-2 flex items-center gap-2 ${isOpponent ? "justify-end" : "justify-start"}`}>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${theme.chip}`}>
                {ultChip}
              </span>
              {activeLabel ? (
                <span className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300">
                  {activeLabel}
                </span>
              ) : null}
            </div>

            <p className="mt-2 truncate text-[11px] text-slate-200">
              <span className="font-semibold uppercase tracking-[0.16em] text-slate-400">Ultimate</span>{" "}
              <span className="font-semibold">{model.ultimateName}</span>
            </p>

            <div className="mt-2.5">
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
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <span>HP</span>
                  <span className="tabular-nums text-slate-200">{Math.round(hpSafe ?? 0)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-800/90">
                  <div className={`h-full rounded-full transition-all duration-300 ${hpColor}`} style={{ width: `${hpPct}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <div className={`${isOpponent ? "order-1" : "order-2"} flex items-center justify-center`}>
            <div className={`relative w-full max-w-[6.75rem] overflow-hidden rounded-[1.1rem] border border-white/15 bg-slate-900/80 shadow-[0_16px_36px_rgba(2,6,23,0.55)] ring-1 ${theme.ring}`}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-slate-950/45" />
              <div className="relative aspect-[3/4]">
                <Image
                  src={portraitSrc(model.avatarId)}
                  alt={`${avatar.name} portrait`}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 96px, 120px"
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
