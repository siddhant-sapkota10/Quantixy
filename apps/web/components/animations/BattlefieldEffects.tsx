"use client";

import { AnimatePresence, motion } from "framer-motion";

type BattlefieldEffectsProps = {
  reduced?: boolean;
  compact?: boolean;
  dimmed?: boolean;
  particleCount?: number;
  animationSpeed?: number;
  rippleIntensity?: number;
  hitPulseKey?: number;
  questionPulseKey?: number;
  ultimatePulseKey?: number;
};

const PARTICLES = Array.from({ length: 25 }, (_, index) => {
  const lane = index % 5;
  return {
    id: index,
    left: `${7 + ((index * 19) % 86)}%`,
    top: `${14 + ((index * 29) % 66)}%`,
    size: 1.5 + (index % 4) * 0.8,
    opacity: 0.05 + (index % 5) * 0.018,
    driftX: (index % 2 === 0 ? 1 : -1) * (10 + lane * 3),
    driftY: -10 - (index % 6) * 2,
    duration: 6.5 + (index % 7) * 0.55,
    delay: index * 0.17,
  };
});

export function BattlefieldEffects({
  reduced = false,
  compact = false,
  dimmed = false,
  particleCount,
  animationSpeed = 1,
  rippleIntensity = 1,
  hitPulseKey = 0,
  questionPulseKey = 0,
  ultimatePulseKey = 0,
}: BattlefieldEffectsProps) {
  const count = Math.max(0, Math.min(25, particleCount ?? (compact ? 10 : 18)));
  const particles = PARTICLES.slice(0, count);
  const calmOpacity = dimmed ? 0.48 : 1;
  const rippleSize = compact ? "h-[22rem] w-[22rem]" : "h-[38rem] w-[38rem]";
  const speed = Math.max(0.35, animationSpeed);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-35"
        style={{
          background:
            "linear-gradient(115deg, transparent 0%, rgba(34,211,238,0.038) 32%, transparent 33%, transparent 62%, rgba(251,113,133,0.032) 63%, transparent 100%)",
          backgroundSize: compact ? "22rem 22rem" : "34rem 34rem",
        }}
      />

      <motion.div
        className={`absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full ${rippleSize}`}
        animate={
          reduced
            ? { opacity: 0.08 * rippleIntensity * calmOpacity }
            : {
                opacity: [0.045, 0.105 * rippleIntensity * calmOpacity, 0.045],
                scale: [0.94, 1.04, 0.94],
              }
        }
        transition={{ duration: 4.8 / speed, repeat: reduced ? 0 : Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(circle, rgba(103,232,249,0.12) 0%, rgba(56,189,248,0.055) 36%, rgba(2,6,23,0) 68%)",
          filter: "blur(1px)",
        }}
      />

      {!reduced
        ? particles.map((particle) => (
            <motion.span
              key={particle.id}
              className="absolute rounded-full bg-cyan-100 shadow-[0_0_10px_rgba(125,211,252,0.34)]"
              style={{
                left: particle.left,
                top: particle.top,
                width: particle.size,
                height: particle.size,
              }}
              animate={{
                opacity: [particle.opacity * calmOpacity, particle.opacity * 1.7 * calmOpacity, particle.opacity * calmOpacity],
                x: [0, particle.driftX, 0],
                y: [0, particle.driftY, 0],
                scale: [0.82, 1.08, 0.88],
              }}
              transition={{
                duration: particle.duration / speed,
                delay: particle.delay,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
            />
          ))
        : null}

      <AnimatePresence>
        {questionPulseKey > 0 ? (
          <motion.div
            key={`question-ripple-${questionPulseKey}`}
            className={`absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full ${rippleSize}`}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={
              reduced
                ? { opacity: [0, 0.09 * rippleIntensity * calmOpacity, 0], scale: 1 }
                : { opacity: [0, 0.16 * rippleIntensity * calmOpacity, 0], scale: [0.88, 1.08, 1.2] }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.18 : 0.42, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle, rgba(125,211,252,0.18) 0%, rgba(34,211,238,0.07) 42%, rgba(2,6,23,0) 70%)",
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {hitPulseKey > 0 ? (
          <motion.div
            key={`hit-shockwave-${hitPulseKey}`}
            className={`absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/35 ${compact ? "h-40 w-40" : "h-64 w-64"}`}
            initial={{ opacity: 0, scale: 0.36 }}
            animate={
              reduced
                ? { opacity: [0, 0.12 * calmOpacity, 0], scale: 1 }
                : { opacity: [0, 0.28 * calmOpacity, 0], scale: [0.36, 1.12, 1.42] }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.16 : 0.28, ease: "easeOut" }}
            style={{ boxShadow: "0 0 28px rgba(34,211,238,0.12)" }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {ultimatePulseKey > 0 ? (
          <motion.div
            key={`ultimate-ripple-${ultimatePulseKey}`}
            className={`absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full ${compact ? "h-56 w-56" : "h-[32rem] w-[32rem]"}`}
            initial={{ opacity: 0, scale: 0.72 }}
            animate={
              reduced
                ? { opacity: [0, 0.11 * calmOpacity, 0], scale: 1 }
                : { opacity: [0, 0.2 * calmOpacity, 0], scale: [0.72, 1.05, 1.28] }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.2 : 0.56, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle, rgba(250,204,21,0.13) 0%, rgba(139,92,246,0.08) 44%, rgba(2,6,23,0) 72%)",
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
