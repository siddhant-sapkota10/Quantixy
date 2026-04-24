import type { Difficulty, Topic } from "./topics";
import type { DuelQuestion } from "@/lib/question-model";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateQuestion: generateSharedQuestion } = require("../../../packages/shared/question-engine");

export type GeneratedQuestion = {
  question: string;
  answer: string;
  questionData: DuelQuestion;
};

export type AiProfile = {
  minMs: number;
  maxMs: number;
  accuracy: number;
};

export const AI_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  easy: { minMs: 5200, maxMs: 12000, accuracy: 0.52 },
  medium: { minMs: 2600, maxMs: 6200, accuracy: 0.72 },
  hard: { minMs: 950, maxMs: 2600, accuracy: 0.9 },
};

export function getSafeAiDifficulty(value?: string): AiDifficulty {
  return AI_DIFFICULTIES.includes(value as AiDifficulty) ? (value as AiDifficulty) : "medium";
}

export function getAiProfile(aiDifficulty: AiDifficulty): AiProfile {
  return AI_PROFILES[aiDifficulty];
}

export function generateQuestion(topic: Topic, difficulty: Difficulty): GeneratedQuestion {
  const q = generateSharedQuestion(topic, difficulty, "ai");
  return {
    question: q.prompt,
    answer: q.answer,
    questionData: q as DuelQuestion,
  };
}
