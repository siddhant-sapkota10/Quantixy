"use client";

import { getRankFromRating, type Rank } from "@/lib/ranks";

type RankBadgeProps = {
  /** Numeric rating — rank will be derived automatically */
  rating?: number;
  /** Pre-resolved Rank object — takes precedence over `rating` */
  rank?: Rank;
  /** Visual size variant */
  size?: "sm" | "md" | "lg";
};

// Dot dimensions per size — colored indicator for fast visual scanning
const DOT_SIZES: Record<NonNullable<RankBadgeProps["size"]>, string> = {
  sm: "h-[5px] w-[5px]",
  md: "h-[6px] w-[6px]",
  lg: "h-2      w-2",
};

// Pill padding, text size, and gap per size
const PILL_SIZES: Record<NonNullable<RankBadgeProps["size"]>, string> = {
  sm: "px-1.5 py-[3px] text-[10px] gap-[4px] tracking-[0.09em]",
  md: "px-2   py-0.5   text-[11px] gap-1     tracking-[0.1em]",
  lg: "px-2.5 py-1     text-xs     gap-1.5   tracking-[0.12em]",
};

// Diamond and Master get a very subtle outer glow to signal prestige
const GLOW_SHADOW: Partial<Record<NonNullable<RankBadgeProps["rank"]>["id"], string>> = {
  diamond: "shadow-[0_0_8px_rgba(99,102,241,0.35)]",
  master:  "shadow-[0_0_10px_rgba(236,72,153,0.35)]",
};

export function RankBadge({ rating, rank: rankProp, size = "md" }: RankBadgeProps) {
  const rank = rankProp ?? (typeof rating === "number" ? getRankFromRating(rating) : null);
  if (!rank) return null;

  const glowClass = GLOW_SHADOW[rank.id] ?? "";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-semibold uppercase ${rank.bgClass} ${rank.textClass} ${rank.borderClass} ${PILL_SIZES[size]} ${glowClass}`}
    >
      {/* Colored dot — instantly scannable at any size */}
      <span
        className={`rounded-full ${rank.progressClass} ${DOT_SIZES[size]}`}
        aria-hidden="true"
      />
      {rank.name}
    </span>
  );
}
