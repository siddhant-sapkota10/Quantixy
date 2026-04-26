import ranksData from "../../../packages/shared/ranks.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RankId = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";

type RankData = {
  id: string;
  name: string;
  minRating: number;
  shortLabel: string;
};

export type RankVisuals = {
  bgClass: string;
  textClass: string;
  borderClass: string;
  /** Solid fill used for progress bars — kept as literal strings for Tailwind JIT */
  progressClass: string;
};

export type Rank = RankData & RankVisuals & { id: RankId };

// ─── Visual mapping (Tailwind classes must be string literals for purging) ────

const RANK_VISUALS: Record<RankId, RankVisuals> = {
  bronze:   { bgClass: "bg-amber-500/10",  textClass: "text-amber-300",  borderClass: "border-amber-400/25",  progressClass: "bg-amber-400"  },
  // Silver uses slightly elevated slate so it reads as a rank, not generic UI text
  silver:   { bgClass: "bg-slate-400/10",  textClass: "text-slate-200",  borderClass: "border-white/12",      progressClass: "bg-slate-200"  },
  gold:     { bgClass: "bg-yellow-500/12", textClass: "text-yellow-200", borderClass: "border-yellow-400/25", progressClass: "bg-yellow-300" },
  platinum: { bgClass: "bg-cyan-500/10",   textClass: "text-cyan-200",   borderClass: "border-cyan-400/25",   progressClass: "bg-cyan-300"   },
  diamond:  { bgClass: "bg-violet-500/10", textClass: "text-violet-200", borderClass: "border-violet-400/25", progressClass: "bg-violet-300" },
  master:   { bgClass: "bg-pink-500/10",   textClass: "text-pink-200",   borderClass: "border-pink-400/25",   progressClass: "bg-pink-300"   },
};

// ─── Data ─────────────────────────────────────────────────────────────────────

export const RANKS: Rank[] = (ranksData.ranks as RankData[]).map((r) => ({
  ...r,
  id: r.id as RankId,
  ...RANK_VISUALS[r.id as RankId],
}));

// Sorted descending for efficient tier lookup
const RANKS_DESC = [...RANKS].sort((a, b) => b.minRating - a.minRating);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derives the rank tier from a numeric rating. Always returns a valid Rank. */
export function getRankFromRating(rating: number): Rank {
  return RANKS_DESC.find((rank) => rating >= rank.minRating) ?? RANKS[0];
}

export type NextRankInfo = {
  nextRank: Rank | null;
  /** 0–1 fraction of progress through the current tier toward the next */
  progress: number;
  /** Rating points needed to reach the next tier; 0 if already at max */
  pointsNeeded: number;
};

/** Returns progress information toward the next rank tier. */
export function getNextRankInfo(rating: number): NextRankInfo {
  const currentRank = getRankFromRating(rating);
  const idx = RANKS.findIndex((r) => r.id === currentRank.id);
  const nextRank = RANKS[idx + 1] ?? null;

  if (!nextRank) {
    return { nextRank: null, progress: 1, pointsNeeded: 0 };
  }

  const rangeSize = nextRank.minRating - currentRank.minRating;
  const progressInRange = rating - currentRank.minRating;

  return {
    nextRank,
    progress: Math.min(1, Math.max(0, progressInRange / rangeSize)),
    pointsNeeded: nextRank.minRating - rating,
  };
}
