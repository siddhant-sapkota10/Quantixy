"use client";

import { useEffect, useState } from "react";
import { getAvatar, type AvatarId, type AvatarUltimateId } from "@/lib/avatars";

type UltimateStatusProps = {
  avatarId: AvatarId;
  ultimateType: AvatarUltimateId;
  ultimateName: string;
  charge: number;
  ready: boolean;
  used: boolean;
  activeUntil: number;
  remainingSeconds?: number;
  flashStacks?: number;
  burnStacks?: number;
  architectNodes?: number;
  architectReady?: boolean;
  fortressStoredDamage?: number;
  jammed?: boolean;
  burning?: boolean;
  titanRecovering?: boolean;
  titanDamageReduction?: number;
  compact?: boolean;
};

const STATUS_THEME: Record<AvatarId, { border: string; text: string; bg: string; glow: string }> = {
  flash: {
    border: "border-amber-300/30",
    text: "text-amber-100",
    bg: "bg-amber-500/10",
    glow: "shadow-[0_0_18px_rgba(250,204,21,0.12)]",
  },
  shadow: {
    border: "border-violet-300/30",
    text: "text-violet-100",
    bg: "bg-violet-500/10",
    glow: "shadow-[0_0_18px_rgba(167,139,250,0.12)]",
  },
  guardian: {
    border: "border-cyan-300/30",
    text: "text-cyan-100",
    bg: "bg-cyan-500/10",
    glow: "shadow-[0_0_18px_rgba(56,189,248,0.12)]",
  },
  inferno: {
    border: "border-rose-300/30",
    text: "text-rose-100",
    bg: "bg-rose-500/10",
    glow: "shadow-[0_0_18px_rgba(251,113,133,0.12)]",
  },
  architect: {
    border: "border-cyan-300/30",
    text: "text-cyan-100",
    bg: "bg-cyan-500/10",
    glow: "shadow-[0_0_18px_rgba(103,232,249,0.12)]",
  },
  titan: {
    border: "border-orange-300/30",
    text: "text-orange-100",
    bg: "bg-orange-500/10",
    glow: "shadow-[0_0_18px_rgba(245,158,11,0.12)]",
  },
};

function formatSeconds(until: number, fallbackSeconds = 0) {
  if (until > Date.now()) {
    return Math.max(0, (until - Date.now()) / 1000).toFixed(1);
  }
  return Math.max(0, fallbackSeconds).toFixed(1);
}

export function UltimateStatus({
  avatarId,
  ultimateType,
  ultimateName,
  charge,
  ready,
  used,
  activeUntil,
  remainingSeconds = 0,
  flashStacks = 0,
  burnStacks = 0,
  architectNodes = 0,
  architectReady = false,
  fortressStoredDamage = 0,
  jammed = false,
  burning = false,
  titanRecovering = false,
  titanDamageReduction = 0,
  compact = false,
}: UltimateStatusProps) {
  const avatar = getAvatar(avatarId);
  const theme = STATUS_THEME[avatarId];
  const [now, setNow] = useState(() => Date.now());
  const active = activeUntil > now || remainingSeconds > 0;

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);

  const statusTone = active
    ? `${theme.border} ${theme.bg} ${theme.text} ${theme.glow}`
    : ready
      ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.1)]"
      : "border-white/10 bg-slate-950/55 text-slate-200";

  const label = active ? `${ultimateName} - ${formatSeconds(activeUntil, remainingSeconds)}s` : ultimateName;
  const stateText = active ? "ACTIVE" : ready ? "READY" : used ? "USED" : `${Math.round(charge)}%`;
  const shellClass = compact
    ? "rounded-xl px-2.5 py-2"
    : "rounded-2xl px-3 py-2.5";

  return (
    <div className={`relative border ${shellClass} ${statusTone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.18em]">
            {avatar.icon} {label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]">
              {stateText}
            </span>
            {jammed ? (
              <span className="rounded-full border border-violet-300/35 bg-violet-500/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-violet-100">
                JAMMED
              </span>
            ) : null}
            {burning ? (
              <span className="rounded-full border border-rose-300/35 bg-rose-500/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-rose-100">
                BURNING
              </span>
            ) : null}
            {titanRecovering ? (
              <span className="rounded-full border border-orange-300/35 bg-orange-500/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-orange-100">
                Recovering
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {ultimateType === "rapid_fire" ? (
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => {
            const filled = index < flashStacks;
            return (
              <span
                key={index}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${
                  filled
                    ? "border-amber-300/60 bg-amber-400/20 text-amber-100"
                    : "border-white/10 bg-slate-950/45 text-slate-500"
                }`}
              >
                ⚡
              </span>
            );
          })}
        </div>
      ) : null}

      {ultimateType === "system_corrupt" ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100/90">
          <span className="rounded-full border border-violet-300/25 bg-violet-500/12 px-2 py-0.5">
            Input Lock
          </span>
          <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5">
            Disruption
          </span>
        </div>
      ) : null}

      {ultimateType === "shield" ? (
        <div className="mt-2">
          {fortressStoredDamage > 0 ? (
            <>
              <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100/85">
                <span>Stored Reflect</span>
                <span>{Math.max(0, Math.round(fortressStoredDamage))}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-950/60">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-all duration-200"
                  style={{ width: `${Math.min(100, (Math.max(0, fortressStoredDamage) / 30) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/90">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-500/12 px-2 py-0.5">
                Fortified
              </span>
              <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5">
                Reduced Damage
              </span>
            </div>
          )}
        </div>
      ) : null}

      {ultimateType === "double" ? (
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 6 }).map((_, index) => {
            const filled = index < burnStacks;
            return (
              <span
                key={index}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${
                  filled
                    ? "border-rose-300/60 bg-rose-400/20 text-rose-100"
                    : "border-white/10 bg-slate-950/45 text-slate-500"
                }`}
              >
                🔥
              </span>
            );
          })}
        </div>
      ) : null}

      {ultimateType === "perfect_sequence" ? (
        <div className="mt-2 flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => {
            const lit = architectNodes > index;
            return (
              <span
                key={index}
                className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${
                  lit
                    ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
                    : "border-white/10 bg-slate-950/45 text-slate-500"
                }`}
              >
                ●
              </span>
            );
          })}
          <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100">
            {architectNodes}/5
          </span>
          {architectReady ? (
            <span className="rounded-full border border-cyan-300/35 bg-cyan-500/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100">
              SYSTEM READY
            </span>
          ) : null}
        </div>
      ) : null}

      {ultimateType === "overpower" ? (
        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em]">
          <span className="rounded-full border border-orange-300/35 bg-orange-500/15 px-2 py-0.5 text-orange-100">
            DMG+
          </span>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-500/12 px-2 py-0.5 text-emerald-100">
            Lifesteal
          </span>
          <span className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-slate-200">
            Resist {Math.round(titanDamageReduction * 100)}%
          </span>
        </div>
      ) : null}
    </div>
  );
}
