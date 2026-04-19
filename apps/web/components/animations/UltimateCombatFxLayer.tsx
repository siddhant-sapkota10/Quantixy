"use client";

import { AnimatePresence, motion } from "framer-motion";

/** Narrow snapshot of duel ultimate state for ambient + strike VFX. */
export type UltimateFxSnapshot = {
  type: string;
  opponentType: string;
  overclockUntil: number;
  opponentOverclockUntil: number;
  infernoPendingUntil: number;
  opponentInfernoPendingUntil: number;
  novaBonusRemaining: number;
  opponentNovaBonusRemaining: number;
  fortressUntil: number;
  opponentFortressUntil: number;
  fortressBlocksRemaining: number;
  opponentFortressBlocksRemaining: number;
  architectUntil: number;
  opponentArchitectUntil: number;
  architectSequenceStreak: number;
  opponentArchitectSequenceStreak: number;
  titanOverpowerUntil: number;
  opponentTitanOverpowerUntil: number;
  shadowCorruptUntil: number;
  opponentShadowCorruptUntil: number;
  flashOverclockStacks: number;
  opponentFlashOverclockStacks: number;
};

export type CombatFxKeys = {
  flashBoltKey: number;
  flashBoltTier: number;
  infernoVolleyKey: number;
  infernoVolleyFrom: "you" | "opponent";
  infernoStacksHint: number;
  titanSlamKey: number;
  titanHealRippleKey: number;
  architectOrbKey: number;
  architectBeamKey: number;
  architectShatterKey: number;
  shadowMindShockKey: number;
  flashSnapKey: number;
  burnTickFlareKey: number;
  burnTickTarget: "you" | "opponent";
};

export const INITIAL_COMBAT_FX: CombatFxKeys = {
  flashBoltKey: 0,
  flashBoltTier: 1,
  infernoVolleyKey: 0,
  infernoVolleyFrom: "you",
  infernoStacksHint: 0,
  titanSlamKey: 0,
  titanHealRippleKey: 0,
  architectOrbKey: 0,
  architectBeamKey: 0,
  architectShatterKey: 0,
  shadowMindShockKey: 0,
  flashSnapKey: 0,
  burnTickFlareKey: 0,
  burnTickTarget: "you"
};

type Props = {
  ultimate: UltimateFxSnapshot;
  combatFx?: CombatFxKeys;
  neuralInputUnlockAt: number;
};

export function UltimateCombatFxLayer({
  ultimate,
  combatFx = INITIAL_COMBAT_FX,
  neuralInputUnlockAt
}: Props) {
  const now = Date.now();
  const snap = ultimate;

  const youFlash = snap.overclockUntil > now;
  const oppFlash = snap.opponentOverclockUntil > now;
  const youInferno = snap.infernoPendingUntil > now;
  const oppInferno = snap.opponentInfernoPendingUntil > now;
  const youFort = snap.fortressUntil > now;
  const oppFort = snap.opponentFortressUntil > now;
  const youArch = snap.architectUntil > now;
  const youTitan = snap.titanOverpowerUntil > now;
  const oppTitan = snap.opponentTitanOverpowerUntil > now;
  const oppShadow = snap.opponentShadowCorruptUntil > now;
  const neuralLock = neuralInputUnlockAt > now;

  const flashTier = Math.max(1, Math.min(5, combatFx.flashBoltTier || 1));

  return (
    <div className="pointer-events-none absolute inset-0 z-[19] overflow-hidden rounded-[2rem]">
      {/* Ambient — Flash Overclock: gold speed tint + edge streaks */}
      {youFlash ? (
        <>
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 18% 40%, rgba(250,204,21,0.22) 0%, transparent 55%), linear-gradient(105deg, rgba(250,204,21,0.08) 0%, transparent 35%)",
              mixBlendMode: "screen"
            }}
          />
          <motion.div
            className="absolute inset-y-0 left-0 w-[14px] opacity-70"
            animate={{ backgroundPosition: ["0px 0px", "0px 120px"] }}
            transition={{ duration: 0.55, repeat: Infinity, ease: "linear" }}
            style={{
              background:
                "repeating-linear-gradient(180deg, transparent 0px, transparent 10px, rgba(250,204,21,0.35) 10px, rgba(250,204,21,0.35) 12px)"
            }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-[14px] opacity-70"
            animate={{ backgroundPosition: ["0px 0px", "0px -120px"] }}
            transition={{ duration: 0.48, repeat: Infinity, ease: "linear" }}
            style={{
              background:
                "repeating-linear-gradient(180deg, transparent 0px, transparent 9px, rgba(253,224,71,0.28) 9px, rgba(253,224,71,0.28) 11px)"
            }}
          />
        </>
      ) : null}

      {oppFlash ? (
        <div
          className="absolute inset-0 opacity-35"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 82% 40%, rgba(250,204,21,0.18) 0%, transparent 55%)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {/* Ambient — Inferno: ember rim */}
      {(youInferno || oppInferno) && (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.22, 0.38, 0.24, 0.36, 0.22] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            boxShadow: `inset 0 0 48px rgba(220,38,38,${0.12 + Math.min(0.22, (youInferno ? snap.novaBonusRemaining : 0) * 0.03)}), inset 0 0 64px rgba(251,113,133,${0.08 + (oppInferno ? snap.opponentNovaBonusRemaining * 0.025 : 0)})`
          }}
        />
      )}

      {/* Ambient — Guardian bastion: cool dome bias */}
      {youFort ? (
        <motion.div
          className="absolute inset-0 opacity-40"
          animate={{ opacity: [0.28, 0.42, 0.3, 0.4, 0.28] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 22% 72%, rgba(56,189,248,0.22) 0%, transparent 58%), radial-gradient(ellipse 40% 50% at 18% 88%, rgba(125,211,252,0.12) 0%, transparent 50%)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {oppFort ? (
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 78% 75%, rgba(56,189,248,0.16) 0%, transparent 55%)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {/* Ambient — Architect grid */}
      {youArch ? (
        <motion.div
          className="absolute inset-0 opacity-30"
          animate={{ opacity: [0.22, 0.32, 0.24, 0.3, 0.22] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(251,191,36,0.07) 1px, transparent 1px), linear-gradient(180deg, rgba(251,191,36,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {/* Ambient — Architect: floating cubes orbit (streak count, matches server burst threshold 3) */}
      {youArch ? (() => {
        const cap = 3;
        const streak = Math.max(0, Math.min(cap, snap.architectSequenceStreak ?? 0));
        if (streak <= 0) return null;
        return (
          <div className="pointer-events-none absolute left-[7%] top-[12%] z-[22] h-28 w-28 sm:left-[8%] sm:top-[13%]">
            <motion.div
              className="relative h-full w-full"
              animate={{ rotate: -360 }}
              transition={{ duration: 19, repeat: Infinity, ease: "linear" }}
            >
              <div className="absolute left-1/2 top-1/2 h-0 w-0">
                {Array.from({ length: streak }).map((_, i) => {
                  const slice = (Math.PI * 2) / streak;
                  const angle = -Math.PI / 2 + slice * i;
                  const r = 40;
                  const x = Math.cos(angle) * r;
                  const y = Math.sin(angle) * r;
                  return (
                    <div
                      key={`arch-orbit-${i}-${streak}`}
                      className="absolute h-2.5 w-2.5 rounded-sm border border-amber-100/95 bg-gradient-to-br from-amber-200/95 to-amber-700/55 shadow-[0_0_16px_rgba(251,191,36,0.85)]"
                      style={{
                        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`
                      }}
                    />
                  );
                })}
              </div>
            </motion.div>
          </div>
        );
      })() : null}

      {/* Ambient — Titan overpower weight */}
      {youTitan ? (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.12, 0.2, 0.14, 0.18, 0.12] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(180,83,9,0.35) 0%, transparent 55%)",
            mixBlendMode: "multiply"
          }}
        />
      ) : null}

      {oppTitan ? (
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 80% 100%, rgba(245,158,11,0.22) 0%, transparent 55%)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {/* Opponent Shadow pressure — extra scan + edge flicker (Neural Jam) */}
      {oppShadow ? (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.04, 0.1, 0.06, 0.11, 0.05], x: [0, 1, -1, 0.5, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background:
              "repeating-linear-gradient(180deg, rgba(15,23,42,0.02) 0px, rgba(15,23,42,0.02) 6px, rgba(167,139,250,0.05) 6px, rgba(167,139,250,0.05) 8px)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {neuralLock && oppShadow ? (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.14, 0.08, 0.12, 0.06] }}
          transition={{ duration: 0.45, repeat: Infinity, ease: "easeInOut" }}
          style={{
            boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.25)",
            mixBlendMode: "screen"
          }}
        />
      ) : null}

      {/* Floating combo readout — Flash */}
      {youFlash && snap.flashOverclockStacks > 0 ? (
        <motion.div
          key={`combo-${snap.flashOverclockStacks}`}
          className="absolute bottom-[22%] left-[8%] z-20 rounded-full border border-amber-300/50 bg-amber-950/80 px-3 py-1 text-xs font-black tabular-nums text-amber-100 shadow-[0_0_20px_rgba(250,204,21,0.35)]"
          initial={{ opacity: 0, scale: 0.85, y: 8 }}
          animate={{ opacity: 1, scale: [0.9, 1.08, 1], y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          ⚡ x{snap.flashOverclockStacks}
        </motion.div>
      ) : null}

      {/* Strike — lightning chain (Flash correct) */}
      <AnimatePresence>
        {combatFx.flashBoltKey > 0 ? (
          <motion.div
            key={`fb-${combatFx.flashBoltKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.svg
              viewBox="0 0 200 48"
              className="absolute left-[10%] top-[30%] h-16 w-[55%]"
              initial={{ opacity: 0, filter: "blur(2px)" }}
              animate={{ opacity: [0, 1, 0.85, 0], filter: ["blur(2px)", "blur(0px)", "blur(0px)", "blur(1px)"] }}
              transition={{ duration: 0.42, ease: "easeOut" }}
            >
              <polyline
                points="8,36 38,14 62,28 96,10 128,30 154,12 188,22"
                fill="none"
                stroke="#FDE047"
                strokeWidth={2.2 + flashTier * 0.35}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 10px rgba(250,204,21,0.9))" }}
              />
            </motion.svg>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Strike — Overclock reset snap */}
      <AnimatePresence>
        {combatFx.flashSnapKey > 0 ? (
          <motion.div
            key={`snap-${combatFx.flashSnapKey}`}
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — Inferno fireball across */}
      <AnimatePresence>
        {combatFx.infernoVolleyKey > 0 ? (
          <motion.div
            key={`inf-${combatFx.infernoVolleyKey}`}
            className="absolute left-[8%] top-[36%] h-10 w-10 rounded-full"
            style={{
              background: "radial-gradient(circle, #fb7185 0%, #ea580c 45%, transparent 70%)",
              boxShadow: "0 0 28px rgba(251,113,133,0.75)"
            }}
            initial={{ opacity: 0, x: 0, scale: 0.6 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: combatFx.infernoVolleyFrom === "you" ? [0, 280, 520] : [520, 280, 0],
              scale: [0.6, 1.05 + Math.min(0.35, combatFx.infernoStacksHint * 0.04), 1.15, 0.9]
            }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — burn tick flare on victim side */}
      <AnimatePresence>
        {combatFx.burnTickFlareKey > 0 ? (
          <motion.div
            key={`burn-${combatFx.burnTickFlareKey}`}
            className="absolute top-[12%] h-24 w-24 rounded-full"
            style={{
              left: combatFx.burnTickTarget === "you" ? "12%" : "72%",
              background: "radial-gradient(circle, rgba(251,113,133,0.75) 0%, transparent 70%)",
              mixBlendMode: "screen"
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.5, 1.35, 1.6] }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — Titan slam */}
      <AnimatePresence>
        {combatFx.titanSlamKey > 0 ? (
          <motion.div
            key={`titan-${combatFx.titanSlamKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.28 }}
          >
            <motion.div
              className="absolute left-1/2 top-[40%] h-40 w-40 -translate-x-1/2 rounded-full border-4 border-orange-400/70"
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: [0.4, 1.5, 2.2], opacity: [0.9, 0.35, 0] }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Strike — Titan heal ripple (you, left bias) */}
      <AnimatePresence>
        {combatFx.titanHealRippleKey > 0 ? (
          <motion.div
            key={`heal-${combatFx.titanHealRippleKey}`}
            className="absolute left-[14%] top-[62%] h-32 w-32 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(52,211,153,0.55) 0%, transparent 70%)",
              mixBlendMode: "screen"
            }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1.2, 1.5] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — Architect stack orb */}
      <AnimatePresence>
        {combatFx.architectOrbKey > 0 ? (
          <motion.div
            key={`orb-${combatFx.architectOrbKey}`}
            className="absolute left-[18%] top-[24%] h-5 w-5 rounded-sm border border-amber-200/80 bg-amber-400/40 shadow-[0_0_18px_rgba(251,191,36,0.65)]"
            initial={{ opacity: 0, y: 16, rotate: -20 }}
            animate={{ opacity: [0, 1, 0.9, 0], y: [16, -6, -14], rotate: [-20, 8, 0] }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — Architect beam */}
      <AnimatePresence>
        {combatFx.architectBeamKey > 0 ? (
          <motion.div
            key={`beam-${combatFx.architectBeamKey}`}
            className="absolute left-[12%] top-[32%] h-[3px] w-[65%] origin-left rounded-full"
            style={{
              background: "linear-gradient(90deg, rgba(253,230,138,0.95), rgba(251,191,36,0.2), transparent)",
              boxShadow: "0 0 24px rgba(251,191,36,0.9)"
            }}
            initial={{ opacity: 0, scaleX: 0.05 }}
            animate={{ opacity: [0, 1, 0.85, 0], scaleX: [0.05, 1, 1, 0.2] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {/* Strike — Architect / sequence shatter */}
      <AnimatePresence>
        {combatFx.architectShatterKey > 0 ? (
          <motion.div
            key={`shatter-${combatFx.architectShatterKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/3 h-8 w-1.5 rounded-full bg-amber-200/90"
                style={{ rotate: `${i * 28}deg` }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: [0, (i - 2.5) * 22],
                  y: [0, 40 + i * 6],
                  scale: [0.6, 1, 0.4]
                }}
                transition={{ duration: 0.45, ease: "easeOut", delay: i * 0.02 }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Strike — Neural wrong mind shock */}
      <AnimatePresence>
        {combatFx.shadowMindShockKey > 0 ? (
          <motion.div
            key={`mind-${combatFx.shadowMindShockKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.25, 0] }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(167,139,250,0.55) 0%, rgba(76,29,149,0.35) 40%, transparent 70%)",
              mixBlendMode: "screen"
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
