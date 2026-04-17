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

const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { minMs: 6000, maxMs: 14000, accuracy: 0.5 },
  medium: { minMs: 2800, maxMs: 7000, accuracy: 0.7 },
  hard: { minMs: 900, maxMs: 3200, accuracy: 0.88 },
};

export function getAiProfile(difficulty: Difficulty): AiProfile {
  return AI_PROFILES[difficulty];
}

export function generateQuestion(topic: Topic, difficulty: Difficulty): GeneratedQuestion {
  const q = generateSharedQuestion(topic, difficulty, "ai");
  return {
    question: q.prompt,
    answer: q.answer,
    questionData: q as DuelQuestion,
  };
}
