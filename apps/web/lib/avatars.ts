export const AVATAR_IDS = [
  "flash",
  "titan",
  "shadow",
  "inferno",
  "frost",
  "volt",
  "aegis",
  "nova"
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];
export type AvatarRarity = "common";
export type AvatarUltimateId =
  | "lightning_surge"
  | "iron_will"
  | "blackout"
  | "cataclysm"
  | "glacier_lock"
  | "overclock"
  | "bulwark"
  | "starfall";

export type Avatar = {
  id: AvatarId;
  name: string;
  icon: string;
  emoji: string;
  label: string;
  rarity: AvatarRarity;
  unlockKey: string | null;
  ultimateId: AvatarUltimateId;
  ultimateName: string;
  ultimateDescription: string;
};

export const AVATARS: Avatar[] = [
  {
    id: "flash",
    name: "Flash",
    icon: "⚡",
    emoji: "⚡",
    label: "Flash",
    rarity: "common",
    unlockKey: null,
    ultimateId: "lightning_surge",
    ultimateName: "Lightning Surge",
    ultimateDescription: "Next 2 first-correct answers each gain +1 bonus point."
  },
  {
    id: "titan",
    name: "Titan",
    icon: "🛡️",
    emoji: "🛡️",
    label: "Titan",
    rarity: "common",
    unlockKey: null,
    ultimateId: "iron_will",
    ultimateName: "Iron Will",
    ultimateDescription: "Immune to debuffs for 8 seconds."
  },
  {
    id: "shadow",
    name: "Shadow",
    icon: "🌑",
    emoji: "🌑",
    label: "Shadow",
    rarity: "common",
    unlockKey: null,
    ultimateId: "blackout",
    ultimateName: "Blackout",
    ultimateDescription: "Disable opponent input for 3 seconds."
  },
  {
    id: "inferno",
    name: "Inferno",
    icon: "🔥",
    emoji: "🔥",
    label: "Inferno",
    rarity: "common",
    unlockKey: null,
    ultimateId: "cataclysm",
    ultimateName: "Cataclysm",
    ultimateDescription: "Next correct answer gives +3 points."
  },
  {
    id: "frost",
    name: "Frost",
    icon: "❄️",
    emoji: "❄️",
    label: "Frost",
    rarity: "common",
    unlockKey: null,
    ultimateId: "glacier_lock",
    ultimateName: "Glacier Lock",
    ultimateDescription: "Upcoming v2 ultimate."
  },
  {
    id: "volt",
    name: "Volt",
    icon: "🔋",
    emoji: "🔋",
    label: "Volt",
    rarity: "common",
    unlockKey: null,
    ultimateId: "overclock",
    ultimateName: "Overclock",
    ultimateDescription: "Upcoming v2 ultimate."
  },
  {
    id: "aegis",
    name: "Aegis",
    icon: "🗿",
    emoji: "🗿",
    label: "Aegis",
    rarity: "common",
    unlockKey: null,
    ultimateId: "bulwark",
    ultimateName: "Bulwark",
    ultimateDescription: "Upcoming v2 ultimate."
  },
  {
    id: "nova",
    name: "Nova",
    icon: "🌟",
    emoji: "🌟",
    label: "Nova",
    rarity: "common",
    unlockKey: null,
    ultimateId: "starfall",
    ultimateName: "Starfall",
    ultimateDescription: "Upcoming v2 ultimate."
  }
];

export const AVATAR_MAP = new Map<AvatarId, Avatar>(AVATARS.map((avatar) => [avatar.id, avatar]));

export const DEFAULT_AVATAR_ID: AvatarId = "flash";

export function getAvatar(id: string | null | undefined): Avatar {
  return AVATAR_MAP.get(id as AvatarId) ?? (AVATAR_MAP.get(DEFAULT_AVATAR_ID) as Avatar);
}

