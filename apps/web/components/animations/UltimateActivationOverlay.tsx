"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ULTIMATE_VFX, type UltimateType } from "@/lib/ultimate-vfx";

export type UltimateActivationCue = {
  id: number;
  by: "you" | "opponent";
  target: "you" | "opponent";
  type: UltimateType;
};

export function UltimateActivationOverlay({ cue }: { cue: UltimateActivationCue | null }) {
  return <AnimatePresence>{cue ? <OverlayContent key={cue.id} cue={cue} /> : null}</AnimatePresence>;
}

function OverlayContent({ cue }: { cue: UltimateActivationCue }) {
  const config = ULTIMATE_VFX[cue.type];
  const presentation = config.presentation;
  const isEnemyCast = cue.by === "opponent";
  const sourceX = cue.by === "you" ? "26%" : "74%";
  const targetX = cue.target === "you" ? "26%" : "74%";
  const pulseOpacity =
    presentation.screenPulseStrength === "strong"
      ? 0.28
      : presentation.screenPulseStrength === "medium"
        ? 0.22
        : 0.16;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[2rem]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Screen pulse / emphasis */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1 }}
        animate={{ opacity: [0, pulseOpacity, pulseOpacity * 0.45, 0], scale: [1, 1.012, 1.006, 1] }}
        transition={{ duration: 0.42, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.10) 0%, transparent 62%)"
        }}
      />

      {presentation.overlayEffect === "edge_pulse" ? (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.54, ease: "easeOut" }}
          style={{
            boxShadow: `inset 0 0 0 1px ${presentation.primary}66, inset 0 0 42px ${presentation.primary}55`
          }}
        />
      ) : null}

      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{
          background: `radial-gradient(circle at ${sourceX} 34%, ${config.tint} 0%, transparent 50%)`
        }}
      />

      <motion.div
        className="absolute top-[28%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          left: sourceX,
          borderColor: `${config.accent}66`
        }}
        initial={{ opacity: 0, scale: 0.65 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.65, 1.25, 1.5] }}
        transition={{ duration: 0.72, ease: "easeOut" }}
      />

      {cue.type === "rapid_fire" ? (
        <>
          <motion.svg
            viewBox="0 0 160 36"
            className="absolute top-[23%] h-12 w-[36%]"
            style={{ left: cue.by === "you" ? "19%" : "45%" }}
            initial={{ opacity: 0, x: cue.by === "you" ? -14 : 14 }}
            animate={{ opacity: [0, 1, 0], x: cue.by === "you" ? [-14, 30, 44] : [14, -30, -44] }}
            transition={{ duration: 0.44, ease: "easeOut" }}
          >
            <polyline
              points={cue.by === "you" ? "6,28 42,8 72,22 102,10 134,18 154,8" : "154,28 118,8 88,22 58,10 26,18 6,8"}
              fill="none"
              stroke={presentation.primary}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
          {[0, 1, 2].map((line) => (
            <motion.div
              key={line}
              className="absolute top-[24%] h-[2px] rounded-full"
              style={{
                left: cue.by === "you" ? "20%" : "52%",
                width: "26%",
                background: `linear-gradient(90deg, transparent 0%, ${presentation.primary} 45%, transparent 100%)`
              }}
              initial={{ opacity: 0, x: cue.by === "you" ? -16 : 16 }}
              animate={{
                opacity: [0, 0.95, 0],
                x: cue.by === "you" ? [ -16, 34, 58 ] : [16, -34, -58],
                y: line * 8
              }}
              transition={{ duration: 0.48, ease: "easeOut", delay: line * 0.06 }}
            />
          ))}
        </>
      ) : null}

      {cue.type === "system_corrupt" ? (
        <>
          {/* Scanline + glitch burst (subtle, readable) */}
          <motion.div
            className="absolute inset-y-0 w-[46%]"
            style={{
              left: cue.target === "you" ? "4%" : "50%",
              background:
                "repeating-linear-gradient(180deg, rgba(2,6,23,0.10) 0px, rgba(2,6,23,0.10) 5px, rgba(167,139,250,0.14) 5px, rgba(167,139,250,0.14) 7px)"
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0.12, 0] }}
            transition={{ duration: 0.62, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.18, 0] }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(167,139,250,0.26) 0%, rgba(124,58,237,0.18) 28%, rgba(2,6,23,0) 62%)",
              mixBlendMode: "screen"
            }}
          />
          {[0, 1, 2, 3].map((idx) => (
            <motion.div
              key={`corrupt-glitch-${idx}`}
              className="absolute top-[26%] h-[2px] rounded-full"
              style={{
                left: cue.target === "you" ? "10%" : "56%",
                width: `${18 + idx * 5}%`,
                background: "linear-gradient(90deg, transparent 0%, rgba(221,214,254,0.95) 50%, transparent 100%)",
                filter: "drop-shadow(0 0 10px rgba(167,139,250,0.35))"
              }}
              initial={{ opacity: 0, x: idx % 2 === 0 ? -10 : 10 }}
              animate={{ opacity: [0, 0.95, 0], x: idx % 2 === 0 ? [-10, 18, 24] : [10, -18, -24], y: idx * 9 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: idx * 0.04 }}
            />
          ))}
        </>
      ) : null}

      {cue.type === "perfect_sequence" ? (
        <>
          {/* Golden geometric activation: refined, precise, readable */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.18, 0] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle at 50% 30%, rgba(251,191,36,0.26) 0%, rgba(245,158,11,0.16) 28%, rgba(2,6,23,0) 62%)",
              mixBlendMode: "screen"
            }}
          />

          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: [0, 0.32, 0], scale: [0.96, 1.02, 1.06] }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            style={{
              background:
                "linear-gradient(90deg, rgba(251,191,36,0.12) 1px, transparent 1px), linear-gradient(180deg, rgba(251,191,36,0.10) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              mixBlendMode: "screen"
            }}
          />

          {[0, 1, 2].map((ring) => (
            <motion.div
              key={`arch-ring-${ring}`}
              className="absolute top-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                left: sourceX,
                width: `${140 + ring * 52}px`,
                height: `${140 + ring * 52}px`,
                borderColor: ring === 0 ? "rgba(251,191,36,0.75)" : "rgba(253,230,138,0.35)",
                boxShadow: ring === 0 ? "0 0 26px rgba(251,191,36,0.22)" : "none"
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 0.9, 0], scale: [0.8, 1.04 + ring * 0.03, 1.18 + ring * 0.05] }}
              transition={{ duration: 0.6, ease: "easeOut", delay: ring * 0.04 }}
            />
          ))}
        </>
      ) : null}

      {cue.type === "overpower" ? (
        <>
          {/* Volcanic shockwave + debris burst (premium, heavy, readable) */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.65, 0.22, 0] }}
            transition={{ duration: 0.46, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(245,158,11,0.30) 0%, rgba(120,53,15,0.22) 35%, rgba(2,6,23,0) 66%)",
              mixBlendMode: "screen"
            }}
          />

          <motion.div
            className="absolute top-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              left: sourceX,
              width: "240px",
              height: "240px",
              borderColor: "rgba(245,158,11,0.55)",
              boxShadow: "0 0 34px rgba(245,158,11,0.20), inset 0 0 18px rgba(245,158,11,0.12)"
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.7, 1.08, 1.28] }}
            transition={{ duration: 0.62, ease: "easeOut" }}
          />

          {[0, 1, 2, 3, 4].map((frag) => (
            <motion.div
              key={`titan-frag-${frag}`}
              className="absolute top-[28%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm"
              style={{
                left: sourceX,
                background: frag % 2 === 0 ? "rgba(148,163,184,0.50)" : "rgba(245,158,11,0.45)",
                filter: "drop-shadow(0 0 10px rgba(245,158,11,0.25))"
              }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.7 }}
              animate={{
                opacity: [0, 1, 0],
                x: [0, (frag - 2) * 28],
                y: [0, -22 - frag * 8],
                rotate: [0, frag % 2 === 0 ? 55 : -55],
                scale: [0.7, 1.1, 0.85]
              }}
              transition={{ duration: 0.55, ease: "easeOut", delay: frag * 0.02 }}
            />
          ))}
        </>
      ) : null}

      {cue.type === "shield" ? (
        <>
          <motion.div
            className="absolute top-[28%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: sourceX,
              background: `radial-gradient(circle at 50% 50%, rgba(56,189,248,0.34) 0%, rgba(2,6,23,0) 72%)`
            }}
            initial={{ opacity: 0, scale: 0.68 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.68, 1.08, 1.3] }}
            transition={{ duration: 0.72, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-[27%] h-32 w-52 -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
            style={{
              left: sourceX,
              background:
                "radial-gradient(ellipse at 50% 60%, rgba(56,189,248,0.34) 0%, rgba(14,116,144,0.16) 52%, rgba(2,6,23,0) 74%)"
            }}
            initial={{ opacity: 0, scaleX: 0.75, scaleY: 0.62 }}
            animate={{ opacity: [0, 0.82, 0], scaleX: [0.75, 1.08, 1.26], scaleY: [0.62, 0.98, 1.16] }}
            transition={{ duration: 0.62, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-[28%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: sourceX,
              borderColor: `${config.accent}88`
            }}
            initial={{ opacity: 0, scale: 0.72 }}
            animate={{ opacity: [0, 1, 0], scale: [0.72, 1, 1.24] }}
            transition={{ duration: 0.75, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-[28%] h-[2px] w-36 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: sourceX,
              background: "linear-gradient(90deg, transparent 0%, rgba(125,211,252,0.95) 50%, transparent 100%)"
            }}
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: [0, 0.95, 0], scaleX: [0.4, 1.35, 1.6] }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          />
          {[0, 1].map((idx) => (
            <motion.svg
              key={`aegis-arc-${idx}`}
              viewBox="0 0 180 44"
              className="absolute top-[24%] h-12 w-[40%]"
              style={{ left: cue.by === "you" ? "16%" : "44%" }}
              initial={{ opacity: 0, x: cue.by === "you" ? -18 : 18 }}
              animate={{
                opacity: [0, 0.9, 0],
                x: cue.by === "you" ? [-18, 12, 30] : [18, -12, -30],
                y: idx * 6
              }}
              transition={{ duration: 0.54, ease: "easeOut", delay: idx * 0.06 }}
            >
              <polyline
                points={cue.by === "you" ? "8,30 34,16 64,26 92,12 122,22 152,10 172,18" : "172,30 146,16 116,26 88,12 58,22 28,10 8,18"}
                fill="none"
                stroke="rgba(125,211,252,0.95)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          ))}
        </>
      ) : null}

      {cue.type === "double" ? (
        <>
          <motion.div
            className="absolute top-[28%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: sourceX,
              background: `radial-gradient(circle, ${config.accent}55 0%, transparent 68%)`
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.92, 0], scale: [0.6, 1.18, 1.42] }}
            transition={{ duration: 0.62, ease: "easeOut" }}
          />
          {[0, 1, 2].map((flame) => (
            <motion.div
              key={`inferno-flame-${flame}`}
              className="absolute top-[28%] h-24 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `calc(${sourceX} + ${(flame - 1) * 16}px)`,
                background:
                  "linear-gradient(180deg, rgba(253,186,116,0.96) 0%, rgba(251,113,133,0.86) 55%, rgba(136,19,55,0) 100%)",
                filter: "drop-shadow(0 0 10px rgba(251,113,133,0.45))"
              }}
              initial={{ opacity: 0, y: 10, scaleY: 0.7 }}
              animate={{ opacity: [0, 0.95, 0], y: [10, -14, -24], scaleY: [0.7, 1.18, 0.92] }}
              transition={{ duration: 0.62, ease: "easeOut", delay: flame * 0.05 }}
            />
          ))}
        </>
      ) : null}

      {cue.type === "double" ? (
        <motion.div
          className="absolute left-1/2 top-[28%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.7, 1.26, 1.45] }}
          transition={{ duration: 0.62, ease: "easeOut" }}
          style={{
            background: `radial-gradient(circle at center, ${presentation.secondary}66 0%, transparent 68%)`
          }}
        />
      ) : null}

      <motion.div
        className="absolute top-[28%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          left: targetX,
          borderColor: `${config.accent}4d`
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.65, 0], scale: [0.5, 1.05, 1.2] }}
        transition={{ duration: 0.64, ease: "easeOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.92 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-12, 0, 0, -6], scale: [0.92, 1.02, 1, 0.98] }}
        transition={{ duration: 1.02, ease: "easeOut" }}
        className="absolute left-1/2 top-2 z-10 w-[calc(100%-0.75rem)] max-w-[32rem] -translate-x-1/2 px-1 sm:top-3 sm:w-auto sm:max-w-[38rem]"
      >
        <div
          className="rounded-2xl border px-3 py-2 text-white shadow-xl sm:px-4"
          style={{
            borderColor: `${config.accent}88`,
            background: "linear-gradient(180deg, rgba(2,6,23,0.93) 0%, rgba(2,6,23,0.82) 100%)",
            boxShadow: `0 10px 36px ${config.glow}`
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] sm:text-[11px]"
              style={{
                color: isEnemyCast ? "#fecaca" : "#bbf7d0",
                background: isEnemyCast ? "rgba(127,29,29,0.45)" : "rgba(20,83,45,0.45)"
              }}
            >
              {isEnemyCast ? "Enemy Ultimate" : "Your Ultimate"}
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-slate-300 sm:text-[11px]">
              {config.avatarName}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="text-xl sm:text-2xl" aria-hidden="true">
              {config.icon}
            </span>
            <p className="truncate text-sm font-black uppercase tracking-[0.16em] sm:text-base" style={{ color: config.accent }}>
              {config.ultimateName}
            </p>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
            {config.icon} {config.avatarName.toUpperCase()} SIGNATURE
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
