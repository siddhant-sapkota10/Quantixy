"use client";

import { resolveProfileIcon, type ProfileIconRecord } from "@/lib/profile-icon";

type ProfileIconBadgeProps = {
  icon: ProfileIconRecord | null | undefined;
  fallbackName?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_STYLES = {
  sm: {
    wrap: "h-10 w-10 text-sm",
    emoji: "text-lg",
    text: "text-sm",
  },
  md: {
    wrap: "h-12 w-12 text-base",
    emoji: "text-2xl",
    text: "text-base",
  },
  lg: {
    wrap: "h-20 w-20 text-2xl",
    emoji: "text-4xl",
    text: "text-2xl",
  },
} as const;

export function ProfileIconBadge({ icon, fallbackName, size = "md", className = "" }: ProfileIconBadgeProps) {
  const resolved = resolveProfileIcon(icon, fallbackName);
  const styles = SIZE_STYLES[size];

  if (resolved.mode === "image" && resolved.imageUrl) {
    return (
      <span className={`inline-flex overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950/60 ${styles.wrap} ${className}`}>
        <img src={resolved.imageUrl} alt={`${fallbackName ?? "Player"} profile icon`} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),rgba(15,23,42,0.92))] font-black text-white shadow-[0_12px_32px_rgba(8,47,73,0.28)] ${styles.wrap} ${className}`}
    >
      {resolved.mode === "emoji" ? (
        <span className={styles.emoji} aria-hidden="true">
          {resolved.emoji}
        </span>
      ) : (
        <span className={`${styles.text} tracking-[0.18em]`}>{resolved.text}</span>
      )}
    </span>
  );
}
