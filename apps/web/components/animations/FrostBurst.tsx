"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Icy-blue radial burst rendered as an absolute overlay over the question card
 * when a freeze power-up hits the local player.  Pointer-events: none so it
 * never blocks input.
 */
export function FrostBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="frost-burst"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]"
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: [0, 0.85, 0.6, 0], scale: [0.82, 1.06, 1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(186,230,253,0.75) 0%, rgba(56,189,248,0.5) 38%, rgba(14,165,233,0.2) 62%, transparent 80%)",
          }}
        />
      )}
    </AnimatePresence>
  );
}
