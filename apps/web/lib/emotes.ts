import emotesData from "../../../packages/shared/emotes.json";

export type Emote = {
  id: string;
  label: string;
  icon: string;
  category: "bm" | "celebration" | "neutral";
  pack: string;
};

export const EMOTES = emotesData as Emote[];

export function getEmoteById(emoteId: string) {
  return EMOTES.find((emote) => emote.id === emoteId) ?? EMOTES[0];
}
