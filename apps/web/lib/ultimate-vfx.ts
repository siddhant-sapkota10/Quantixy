export type UltimateType =
  | "rapid_fire"
  | "system_corrupt"
  | "perfect_sequence"
  | "overpower"
  | "shield"
  | "double";

export type UltimatePresentationConfig = {
  primary: string;
  secondary: string;
  buttonGradient: string;
  effectStyle: "lightning" | "shadow_wave" | "aegis" | "inferno_burst";
  overlayEffect?: "edge_pulse" | "scanline" | "ring_burst" | "heat_bloom";
  projectileStyle?: "bolt" | "wave" | "shield" | "slash";
  screenPulseStrength?: "soft" | "medium" | "strong";
};

export type UltimateVfxConfig = {
  avatarName: string;
  ultimateName: string;
  icon: string;
  accent: string;
  glow: string;
  tint: string;
  durationMs?: number;
  presentation: UltimatePresentationConfig;
};

export const ULTIMATE_VFX: Record<UltimateType, UltimateVfxConfig> = {
  rapid_fire: {
    avatarName: "Flash",
    ultimateName: "Overclock",
    icon: "\u26A1",
    accent: "#FACC15",
    glow: "rgba(250, 204, 21, 0.52)",
    tint: "rgba(250, 204, 21, 0.16)",
    durationMs: 6000,
    presentation: {
      primary: "#FACC15",
      secondary: "#FDE68A",
      buttonGradient: "linear-gradient(120deg, rgba(10,10,12,0.96) 0%, rgba(26,20,6,0.96) 45%, rgba(250,204,21,0.88) 100%)",
      effectStyle: "lightning",
      overlayEffect: "edge_pulse",
      projectileStyle: "bolt",
      screenPulseStrength: "medium"
    }
  },
  system_corrupt: {
    avatarName: "Shadow",
    ultimateName: "System Corrupt",
    icon: "\uD83C\uDF11",
    accent: "#A78BFA",
    glow: "rgba(167, 139, 250, 0.45)",
    tint: "rgba(76, 29, 149, 0.22)",
    durationMs: 5000,
    presentation: {
      primary: "#A78BFA",
      secondary: "#C4B5FD",
      buttonGradient:
        "linear-gradient(120deg, rgba(76,29,149,0.92) 0%, rgba(124,58,237,0.86) 55%, rgba(15,23,42,0.92) 100%)",
      effectStyle: "shadow_wave",
      overlayEffect: "scanline",
      projectileStyle: "wave",
      screenPulseStrength: "soft"
    }
  },
  perfect_sequence: {
    avatarName: "Architect",
    ultimateName: "Perfect Sequence",
    icon: "\uD83D\uDCD0",
    accent: "#FBBF24",
    glow: "rgba(251, 191, 36, 0.46)",
    tint: "rgba(217, 119, 6, 0.18)",
    durationMs: 6000,
    presentation: {
      primary: "#FBBF24",
      secondary: "#FDE68A",
      buttonGradient:
        "linear-gradient(120deg, rgba(120,53,15,0.92) 0%, rgba(217,119,6,0.82) 55%, rgba(2,6,23,0.92) 100%)",
      effectStyle: "aegis",
      overlayEffect: "ring_burst",
      projectileStyle: "slash",
      screenPulseStrength: "medium"
    }
  },
  overpower: {
    avatarName: "Titan",
    ultimateName: "Overpower",
    icon: "\uD83E\uDEA8",
    accent: "#F59E0B",
    glow: "rgba(245, 158, 11, 0.48)",
    tint: "rgba(120, 53, 15, 0.22)",
    durationMs: 5000,
    presentation: {
      primary: "#F59E0B",
      secondary: "#FDE68A",
      buttonGradient:
        "linear-gradient(120deg, rgba(120,53,15,0.92) 0%, rgba(245,158,11,0.86) 55%, rgba(2,6,23,0.92) 100%)",
      effectStyle: "inferno_burst",
      overlayEffect: "heat_bloom",
      projectileStyle: "slash",
      screenPulseStrength: "strong"
    }
  },
  shield: {
    avatarName: "Guardian",
    ultimateName: "Aegis Domain",
    icon: "\uD83D\uDEE1\uFE0F",
    accent: "#22D3EE",
    glow: "rgba(34, 211, 238, 0.42)",
    tint: "rgba(34, 211, 238, 0.14)",
    durationMs: 6000,
    presentation: {
      primary: "#38BDF8",
      secondary: "#A5F3FC",
      buttonGradient: "linear-gradient(120deg, rgba(7,16,36,0.96) 0%, rgba(11,28,58,0.94) 50%, rgba(56,189,248,0.88) 100%)",
      effectStyle: "aegis",
      overlayEffect: "ring_burst",
      projectileStyle: "shield",
      screenPulseStrength: "soft"
    }
  },
  double: {
    avatarName: "Inferno",
    ultimateName: "Blaze Surge",
    icon: "\uD83D\uDD25",
    accent: "#FB7185",
    glow: "rgba(251, 113, 133, 0.46)",
    tint: "rgba(244, 63, 94, 0.15)",
    presentation: {
      primary: "#FB7185",
      secondary: "#FDA4AF",
      buttonGradient: "linear-gradient(120deg, rgba(244,63,94,0.92) 0%, rgba(251,113,133,0.92) 55%, rgba(251,146,60,0.92) 100%)",
      effectStyle: "inferno_burst",
      overlayEffect: "heat_bloom",
      projectileStyle: "slash",
      screenPulseStrength: "medium"
    }
  }
};

export function normalizeUltimateType(value: string | null | undefined): UltimateType {
  if (
    value === "rapid_fire" ||
    value === "system_corrupt" ||
    value === "perfect_sequence" ||
    value === "overpower" ||
    value === "shield" ||
    value === "double"
  ) {
    return value;
  }
  return "rapid_fire";
}
