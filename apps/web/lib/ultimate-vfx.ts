export type UltimateType = "rapid_fire" | "jam" | "shield" | "double";

export type UltimateVfxConfig = {
  avatarName: string;
  ultimateName: string;
  icon: string;
  accent: string;
  glow: string;
  tint: string;
  durationMs?: number;
};

export const ULTIMATE_VFX: Record<UltimateType, UltimateVfxConfig> = {
  rapid_fire: {
    avatarName: "Flash",
    ultimateName: "Rapid Fire",
    icon: "\u26A1",
    accent: "#FACC15",
    glow: "rgba(250, 204, 21, 0.45)",
    tint: "rgba(251, 191, 36, 0.14)",
    durationMs: 6000
  },
  jam: {
    avatarName: "Shadow",
    ultimateName: "Jam",
    icon: "\uD83C\uDF11",
    accent: "#A78BFA",
    glow: "rgba(167, 139, 250, 0.45)",
    tint: "rgba(91, 33, 182, 0.2)",
    durationMs: 3000
  },
  shield: {
    avatarName: "Guardian",
    ultimateName: "Fortress Shield",
    icon: "\uD83D\uDEE1\uFE0F",
    accent: "#22D3EE",
    glow: "rgba(34, 211, 238, 0.42)",
    tint: "rgba(34, 211, 238, 0.14)",
    durationMs: 8000
  },
  double: {
    avatarName: "Inferno",
    ultimateName: "Inferno Strike",
    icon: "\uD83D\uDD25",
    accent: "#FB7185",
    glow: "rgba(251, 113, 133, 0.46)",
    tint: "rgba(244, 63, 94, 0.15)"
  }
};

export function normalizeUltimateType(value: string | null | undefined): UltimateType {
  if (value === "rapid_fire" || value === "jam" || value === "shield" || value === "double") {
    return value;
  }
  return "rapid_fire";
}
