import type { Difficulty, Topic } from "./topics";
// Reuse the same generator as PvP so topics/difficulty stay aligned.
// This import is JS (shared module) and is safe to use from TS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateQuestion: generateSharedQuestion } = require("../../../packages/shared/question-engine");

export type GeneratedQuestion = { question: string; answer: string };

export type AiProfile = {
  /** Minimum ms before the AI responds to a question */
  minMs: number;
  /** Maximum ms before the AI responds to a question */
  maxMs: number;
  /** Probability [0–1] that the AI answers correctly */
  accuracy: number;
};

const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy:   { minMs: 6000, maxMs: 14000, accuracy: 0.50 },
  medium: { minMs: 2800, maxMs:  7000, accuracy: 0.70 },
  hard:   { minMs:  900, maxMs:  3200, accuracy: 0.88 },
};

export function getAiProfile(difficulty: Difficulty): AiProfile {
  return AI_PROFILES[difficulty];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function simplifyFraction(num: number, den: number): string {
  if (den === 1 || num === 0) return String(num);
  const g = gcd(Math.abs(num), Math.abs(den));
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

// ---------------------------------------------------------------------------
// Topic generators
// ---------------------------------------------------------------------------

function generateArithmetic(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    const op = rand(0, 1) === 0 ? "+" : "-";
    const a = rand(1, 20);
    const b = rand(1, op === "-" ? a : 20); // keep subtraction result non-negative
    const answer = op === "+" ? a + b : a - b;
    return { question: `${a} ${op} ${b} = ?`, answer: String(answer) };
  }

  if (difficulty === "medium") {
    const type = rand(0, 2);
    if (type === 0) {
      const a = rand(10, 99);
      const b = rand(10, 50);
      return { question: `${a} + ${b} = ?`, answer: String(a + b) };
    }
    if (type === 1) {
      const b = rand(10, 50);
      const a = rand(b, 99);
      return { question: `${a} - ${b} = ?`, answer: String(a - b) };
    }
    const a = rand(2, 12);
    const b = rand(2, 12);
    return { question: `${a} × ${b} = ?`, answer: String(a * b) };
  }

  // hard
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(100, 999);
    const b = rand(100, 499);
    return { question: `${a} + ${b} = ?`, answer: String(a + b) };
  }
  if (type === 1) {
    const b = rand(50, 499);
    const a = rand(b + 1, 999);
    return { question: `${a} - ${b} = ?`, answer: String(a - b) };
  }
  const a = rand(13, 25);
  const b = rand(13, 25);
  return { question: `${a} × ${b} = ?`, answer: String(a * b) };
}

function generateMentalMath(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    if (rand(0, 1) === 0) {
      const a = rand(5, 50);
      return { question: `Double ${a} = ?`, answer: String(a * 2) };
    }
    const a = rand(1, 25) * 2;
    return { question: `Half of ${a} = ?`, answer: String(a / 2) };
  }

  if (difficulty === "medium") {
    const type = rand(0, 2);
    if (type === 0) {
      const a = rand(2, 9) * 10; // multiple of 10
      return { question: `${a} ÷ 5 = ?`, answer: String(a / 5) };
    }
    if (type === 1) {
      const a = rand(2, 9);
      const b = rand(2, 9);
      return { question: `${a}² + ${b}² = ?`, answer: String(a * a + b * b) };
    }
    const a = rand(3, 9);
    return { question: `${a} × 11 = ?`, answer: String(a * 11) };
  }

  // hard
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(12, 25);
    return { question: `${a} × 11 = ?`, answer: String(a * 11) };
  }
  if (type === 1) {
    const a = rand(2, 8);
    return { question: `${a}³ = ?`, answer: String(a * a * a) };
  }
  const a = rand(11, 19);
  const b = rand(11, 19);
  return { question: `${a} × ${b} = ?`, answer: String(a * b) };
}

function generateAlgebra(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    const x = rand(1, 20);
    const b = rand(1, 20);
    if (rand(0, 1) === 0) {
      return { question: `x + ${b} = ${x + b}, x = ?`, answer: String(x) };
    }
    return { question: `x - ${b} = ${x - b}, x = ?`, answer: String(x) };
  }

  if (difficulty === "medium") {
    const a = rand(2, 9);
    const x = rand(1, 15);
    return { question: `${a}x = ${a * x}, x = ?`, answer: String(x) };
  }

  // hard
  const a = rand(2, 6);
  const b = rand(1, 10);
  const x = rand(1, 10);
  const c = a * x + b;
  return { question: `${a}x + ${b} = ${c}, x = ?`, answer: String(x) };
}

function generatePercentages(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    // Use multiples of 20 so 25% and 50% always yield integers
    const bases = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200];
    const pcts = [10, 25, 50] as const;
    const pct = pcts[rand(0, 2)];
    const base = bases[rand(0, bases.length - 1)];
    return { question: `${pct}% of ${base} = ?`, answer: String((pct * base) / 100) };
  }

  if (difficulty === "medium") {
    const bases = [20, 40, 60, 80, 100];
    const pcts = [15, 20, 30, 40, 60, 75] as const;
    const pct = pcts[rand(0, pcts.length - 1)];
    const base = bases[rand(0, bases.length - 1)];
    return { question: `${pct}% of ${base} = ?`, answer: String((pct * base) / 100) };
  }

  // hard — multiples of 200 for clean answers with odd percentages
  const bases = [200, 400, 600];
  const pcts = [15, 35, 45, 55, 65, 85] as const;
  const pct = pcts[rand(0, pcts.length - 1)];
  const base = bases[rand(0, bases.length - 1)];
  return { question: `${pct}% of ${base} = ?`, answer: String((pct * base) / 100) };
}

function generateFractions(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    // Same-denominator addition; den ∈ {2,3,4}
    const den = [2, 3, 4][rand(0, 2)];
    const a = rand(1, den - 1);
    const b = rand(1, den - a); // a+b ≤ den (may equal den → whole number)
    const answer = simplifyFraction(a + b, den);
    return { question: `${a}/${den} + ${b}/${den} = ?`, answer };
  }

  if (difficulty === "medium") {
    // One denominator is a multiple of the other: (a/d1) + (b/d2) where d2 = 2*d1
    const d1 = [2, 3][rand(0, 1)];
    const d2 = d1 * 2;
    const a = rand(1, d1 - 1);
    const b = rand(1, d2 - 1);
    const num = a * d2 + b * d1;
    const den = d1 * d2;
    const answer = simplifyFraction(num, den);
    return { question: `${a}/${d1} + ${b}/${d2} = ?`, answer };
  }

  // hard — different denominators, small values
  const denoms = [2, 3, 4, 5, 6];
  const d1 = denoms[rand(0, 3)];
  let d2 = denoms[rand(0, 4)];
  if (d2 === d1) d2 = denoms[(denoms.indexOf(d2) + 1) % 5];
  const a = rand(1, d1 - 1);
  const b = rand(1, d2 - 1);
  const num = a * d2 + b * d1;
  const den = d1 * d2;
  const answer = simplifyFraction(num, den);
  return { question: `${a}/${d1} + ${b}/${d2} = ?`, answer };
}

function generatePowers(difficulty: Difficulty): GeneratedQuestion {
  if (difficulty === "easy") {
    const base = rand(2, 5);
    const exp = rand(2, 3);
    return { question: `${base}^${exp} = ?`, answer: String(Math.pow(base, exp)) };
  }

  if (difficulty === "medium") {
    if (rand(0, 1) === 0) {
      const base = rand(2, 9);
      const exp = rand(2, 3);
      return { question: `${base}^${exp} = ?`, answer: String(Math.pow(base, exp)) };
    }
    const perfectSquares = [4, 9, 16, 25, 36, 49, 64, 81, 100];
    const n = perfectSquares[rand(0, perfectSquares.length - 1)];
    return { question: `√${n} = ?`, answer: String(Math.sqrt(n)) };
  }

  // hard
  if (rand(0, 1) === 0) {
    const base = rand(2, 10);
    const exp = rand(3, 4);
    return { question: `${base}^${exp} = ?`, answer: String(Math.pow(base, exp)) };
  }
  const bigSquares = [121, 144, 169, 196, 225, 256, 289, 324, 361, 400];
  const n = bigSquares[rand(0, bigSquares.length - 1)];
  return { question: `√${n} = ?`, answer: String(Math.sqrt(n)) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateQuestion(topic: Topic, difficulty: Difficulty): GeneratedQuestion {
  const q = generateSharedQuestion(topic, difficulty, "ai");
  return { question: `${q.prompt} = ?`, answer: q.answer };
}
