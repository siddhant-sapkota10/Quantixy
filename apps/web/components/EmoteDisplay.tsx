"use client";

import { AnimatePresence, motion } from "framer-motion";

export type EmoteDisplayItem = {
  id: number;
  icon: string;
  label: string;
  who: "you" | "opponent";
};

/**
 * Dedicated emote bubble renderer. Sits above the player card and pops in
 * with a bounce, then fades cleanly. Stacks if multiple emotes arrive.
 * Must be inside a `relative` container.
 */
export function EmoteDisplay({ items }: { items: EmoteDisplayItem[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex h-14 flex-col items-center justify-start gap-1.5 overflow-hidden">
      <AnimatePresence>
        {items.slice(-2).map((item) => (
          <motion.div
            key={item.id}
            className={`flex max-w-[92%] items-center gap-2 rounded-full px-3.5 py-1.5 shadow-xl ${
              item.who === "opponent"
                ? "border border-rose-500/40 bg-rose-950/95 text-rose-100"
                : "border border-amber-400/40 bg-amber-950/95 text-amber-100"
            }`}
            initial={{ opacity: 0, scale: 0.4, y: -6 }}
            animate={{
              opacity: 1,
              scale: [0.4, 1.22, 0.93, 1],
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.8,
              y: -4,
              transition: { duration: 0.28, ease: "easeIn" },
            }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="truncate text-[11px] font-bold uppercase tracking-wider opacity-90">
              {item.label}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
