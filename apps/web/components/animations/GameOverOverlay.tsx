"use client";

import { AnimatePresence, motion } from "framer-motion";

type GameOverOverlayProps = {
  /** Pass the result only while the game-over screen is visible; null otherwise. */
  result: "win" | "loss" | "draw" | null;
};

/**
 * Fullscreen overlay layered over the game section on game-over.
 * Win  → subtle radial green glow + brief rotating light-ray burst.
 * Loss → dark radial vignette.
 * Pointer-events: none throughout.
 */
export function GameOverOverlay({ result }: GameOverOverlayProps) {
  return (
    <AnimatePresence>
      {result === "win" && (
        <>
          <motion.div
            key="win-glow"
            className="pointer-events-none absolute inset-0 rounded-[2rem]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse at 50% 40%, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.07) 55%, transparent 75%)",
            }}
          />
          <motion.div
            key="win-rays"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]"
            initial={{ opacity: 0, rotate: -12 }}
            animate={{ opacity: [0, 0.45, 0], rotate: 8 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{
              background: [
                "conic-gradient(from 0deg at 50% 50%,",
                "transparent 0deg,   rgba(134,239,172,0.14)  6deg, transparent 12deg,",
                "transparent 57deg,  rgba(134,239,172,0.10) 63deg, transparent 69deg,",
                "transparent 117deg, rgba(134,239,172,0.14)123deg, transparent 129deg,",
                "transparent 177deg, rgba(134,239,172,0.10)183deg, transparent 189deg,",
                "transparent 237deg, rgba(134,239,172,0.12)243deg, transparent 249deg,",
                "transparent 297deg, rgba(134,239,172,0.09)303deg, transparent 309deg,",
                "transparent 360deg)",
              ].join(" "),
            }}
          />
        </>
      )}

      {result === "loss" && (
        <motion.div
          key="lose-vignette"
          className="pointer-events-none absolute inset-0 rounded-[2rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}

      {result === "draw" && (
        <motion.div
          key="draw-glow"
          className="pointer-events-none absolute inset-0 rounded-[2rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.06) 55%, transparent 75%)"
          }}
        />
      )}
    </AnimatePresence>
  );
}
