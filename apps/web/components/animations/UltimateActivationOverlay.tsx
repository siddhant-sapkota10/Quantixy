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
  const isEnemyCast = cue.by === "opponent";
  const sourceX = cue.by === "you" ? "26%" : "74%";
  const targetX = cue.target === "you" ? "26%" : "74%";

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
        animate={{ opacity: [0, 0.22, 0.1, 0], scale: [1, 1.012, 1.006, 1] }}
        transition={{ duration: 0.42, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.10) 0%, transparent 62%)"
        }}
      />

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
          {[0, 1, 2].map((line) => (
            <motion.div
              key={line}
              className="absolute top-[24%] h-[2px] rounded-full"
              style={{
                left: cue.by === "you" ? "20%" : "52%",
                width: "26%",
                background: `linear-gradient(90deg, transparent 0%, ${config.accent} 45%, transparent 100%)`
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

      {cue.type === "jam" ? (
        <motion.div
          className="absolute inset-y-0 w-[46%]"
          style={{
            left: cue.target === "you" ? "4%" : "50%",
            background:
              "repeating-linear-gradient(180deg, rgba(15,23,42,0.08) 0px, rgba(15,23,42,0.08) 5px, rgba(167,139,250,0.12) 5px, rgba(167,139,250,0.12) 7px)"
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.24, 0.1, 0] }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ) : null}

      {cue.type === "shield" ? (
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
      ) : null}

      {cue.type === "double" ? (
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
            {config.icon} {config.ultimateName.toUpperCase()}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
