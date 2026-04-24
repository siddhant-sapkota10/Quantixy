export type ProfileIconMode = "emoji" | "monogram" | "image";

export type ProfileIconRecord = {
  profileIconMode?: string | null;
  profileIconEmoji?: string | null;
  profileIconText?: string | null;
  profileIconImageUrl?: string | null;
};

export type ResolvedProfileIcon = {
  mode: ProfileIconMode;
  emoji: string;
  text: string;
  imageUrl: string | null;
};

export const PROFILE_ICON_EMOJIS = [
  "✨",
  "⚡",
  "🔥",
  "🌙",
  "🛡️",
  "🎯",
  "🧠",
  "🚀",
  "💎",
  "👑",
  "🌟",
  "🎮",
] as const;

function fallbackMonogram(name?: string | null) {
  const source = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!source) return "Q";

  const parts = source.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function sanitizeProfileIconEmoji(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (PROFILE_ICON_EMOJIS.includes(trimmed as (typeof PROFILE_ICON_EMOJIS)[number])) {
    return trimmed;
  }
  return PROFILE_ICON_EMOJIS[0];
}

export function sanitizeProfileIconText(value?: string | null, fallbackName?: string | null) {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 2);
  return normalized || fallbackMonogram(fallbackName);
}

export function resolveProfileIcon(record: ProfileIconRecord | null | undefined, fallbackName?: string | null): ResolvedProfileIcon {
  const mode = record?.profileIconMode === "emoji" || record?.profileIconMode === "image" ? record.profileIconMode : "monogram";
  const emoji = sanitizeProfileIconEmoji(record?.profileIconEmoji);
  const text = sanitizeProfileIconText(record?.profileIconText, fallbackName);
  const imageUrl = String(record?.profileIconImageUrl ?? "").trim() || null;

  if (mode === "image" && imageUrl) {
    return { mode, emoji, text, imageUrl };
  }

  if (mode === "emoji") {
    return { mode, emoji, text, imageUrl: null };
  }

  return { mode: "monogram", emoji, text, imageUrl: null };
}
