"use client";

import { AnimatePresence, motion } from "framer-motion";

export type FloatingLabelItem = {
  id: number;
  text: string;
  /** CSS color string, e.g. "#6ee7b7" */
  color?: string;
  duration?: number;
  className?: string;
};

/**
 * Renders a stack of animated labels that rise and fade over a relative-
 * positioned parent.  Pointer-events: none so they never block interaction.
 */
export function FloatingLabel({ items }: { items: FloatingLabelItem[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider shadow-lg ${item.className ?? ""}`}
            style={{
              color: item.color ?? "#fff",
              background: "rgba(15,23,42,0.75)",
              border: `1px solid ${item.color ?? "rgba(255,255,255,0.2)"}40`,
            }}
            initial={{ opacity: 0, y: 0, scale: 0.75 }}
            animate={{ opacity: [0, 1, 1, 0], y: -56, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: item.duration ?? 1.2, ease: "easeOut" }}
          >
            {item.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
