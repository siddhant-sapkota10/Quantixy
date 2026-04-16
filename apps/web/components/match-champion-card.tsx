"use client";

import Image from "next/image";
import { useMemo } from "react";
import { getAvatar, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { normalizeUltimateType, ULTIMATE_VFX, type UltimateType } from "@/lib/ultimate-vfx";

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
  fortressUntil?: number;
  fortressBlocksRemaining?: number;
  infernoPending?: boolean;
  infernoPendingUntil?: number;
};

const THEME: Record<AvatarId, { ring: string; glow: string; readyGlow: string; chip: string }> = {
  flash: {
    ring: "ring-amber-300/35",
    glow: "shadow-[0_0_24px_rgba(250,204,21,0.18)]",
    readyGlow: "shadow-[0_0_28px_rgba(250,204,21,0.32)]",
    chip: "border-amber-300/25 bg-amber-500/10 text-amber-200",
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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function secondsLeft(until: number, now: number) {
  if (!until || until <= now) return 0;
  return Math.max(0, Math.ceil((until - now) / 100) / 10); // 0.1s precision
}

export function MatchChampionCard({ model }: { model: MatchChampionCardModel }) {
  const now = Date.now();
  const avatar = useMemo(() => getAvatar(model.avatarId), [model.avatarId]);
  const theme = THEME[model.avatarId];
  const vfx = ULTIMATE_VFX[model.ultimateType];

  const isActiveRapid = (model.overclockUntil ?? 0) > now;
  const isActiveJam = (model.blackoutUntil ?? 0) > now;
  const fortressBlocks = model.fortressBlocksRemaining ?? 0;
  const isActiveFortress = (model.fortressUntil ?? 0) > now && fortressBlocks > 0;
  const isArmedInferno = Boolean(model.infernoPending) && (model.infernoPendingUntil ?? 0) > now;

  const activeLabel = isActiveRapid
    ? `ACTIVE · ${secondsLeft(model.overclockUntil ?? 0, now)}s`
    : isActiveJam
      ? `JAMMED · ${secondsLeft(model.blackoutUntil ?? 0, now)}s`
      : isActiveFortress
        ? `FORTRESS · ${secondsLeft(model.fortressUntil ?? 0, now)}s · ${fortressBlocks} BLOCKS`
        : isArmedInferno
          ? `ARMED · ${secondsLeft(model.infernoPendingUntil ?? 0, now)}s`
          : null;

  const ready = model.ready && !model.used && model.implemented;
  const ultChip =
    model.used ? "USED" : !model.implemented ? "SOON" : ready ? "ULT READY" : `${Math.round(model.charge)}%`;

  const chargePct = Math.max(0, Math.min(100, model.charge));
  const showReadyPulse = ready;

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
          {(isActiveRapid || isActiveFortress || isArmedInferno || isActiveJam) ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  isActiveJam
                    ? "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.55) 0%, transparent 60%)"
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
      {model.avatarId === "shadow" && (isActiveJam || ready) ? (
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

