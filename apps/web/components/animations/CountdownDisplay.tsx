"use client";

import { AnimatePresence, motion } from "framer-motion";

const COLOR: Record<string, string> = {
  "3": "#fbbf24", // amber-400
  "2": "#f97316", // orange-500
  "1": "#ef4444", // red-500
  GO: "#22c55e",  // green-500
};

/**
 * Animated countdown display.
 * Numbers (3 / 2 / 1) scale in from large and blur-fade.
 * "GO!" springs in from small with a bounce.
 */
export function CountdownDisplay({ value }: { value: string | null }) {
  const isGo = value === "GO";
  const color = value ? (COLOR[value] ?? "#bae6fd") : "#bae6fd";

  return (
    <AnimatePresence mode="wait">
      {value && (
        <motion.div
          key={value}
          initial={{
            scale: isGo ? 0.35 : 2.2,
            opacity: 0,
            filter: "blur(14px)",
          }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          exit={{
            scale: isGo ? 1.4 : 0.55,
            opacity: 0,
            filter: "blur(8px)",
          }}
          transition={
            isGo
              ? {
                  type: "spring",
                  stiffness: 240,
                  damping: 13,
                  opacity: { duration: 0.18, ease: "easeIn" },
                  filter: { duration: 0.18, ease: "easeIn" },
                }
              : { duration: 0.22, ease: "easeOut" }
          }
        >
          <p
            className="mt-4 font-black tracking-tight"
            style={{
              color,
              fontSize: isGo ? "clamp(4.5rem,14vw,7.5rem)" : undefined,
            }}
          >
            {isGo ? (
              value
            ) : (
              <span className="text-5xl sm:text-6xl md:text-8xl">{value}</span>
            )}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
