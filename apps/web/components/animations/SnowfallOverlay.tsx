"use client";

import { AnimatePresence, motion } from "framer-motion";

const SNOWFLAKES = [
  { left: "8%", delay: 0, size: "text-lg" },
  { left: "18%", delay: 0.08, size: "text-sm" },
  { left: "28%", delay: 0.18, size: "text-base" },
  { left: "41%", delay: 0.02, size: "text-sm" },
  { left: "54%", delay: 0.12, size: "text-lg" },
  { left: "66%", delay: 0.22, size: "text-sm" },
  { left: "77%", delay: 0.06, size: "text-base" },
  { left: "88%", delay: 0.16, size: "text-lg" }
];

export function SnowfallOverlay({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="snowfall-overlay"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.9, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        >
          {SNOWFLAKES.map((flake, index) => (
            <motion.span
              key={`${flake.left}-${index}`}
              className={`absolute top-0 ${flake.size} text-sky-100/90`}
              style={{ left: flake.left }}
              initial={{ opacity: 0, y: -14, scale: 0.8 }}
              animate={{
                opacity: [0, 1, 0.85, 0],
                y: [0, 42, 92, 128],
                x: [0, -4, 5, -3],
                scale: [0.8, 1, 0.95, 0.88]
              }}
              transition={{
                duration: 1.45,
                delay: flake.delay,
                ease: "easeOut"
              }}
            >
              ❄
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
