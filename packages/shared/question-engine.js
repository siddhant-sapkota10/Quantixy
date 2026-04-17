/**
 * Structured duel question engine (server + web).
 * Optimized for rapid-fire 60s gameplay with optional deterministic visuals.
 */

/** @typedef {"easy"|"medium"|"hard"} Difficulty */
/** @typedef {"arithmetic"|"algebra"|"geometry"|"fractions"|"ratios"|"exponents"|"statistics"|"trigonometry"|"functions"|"calculus"} Topic */
/** @typedef {"int"|"number"|"fraction"|"percent"|"text"|"angle"} AnswerType */
/** @typedef {"number"|"text"} InputMode */
/** @typedef {"none"|"shape"|"angle"|"coordinate"|"number_line"|"fraction_bar"|"pattern"} VisualType */

const TOPICS = [
  "arithmetic",
  "algebra",
  "geometry",
  "fractions",
  "ratios",
  "exponents",
  "statistics",
  "trigonometry",
  "functions",
  "calculus",
];

const DIFFICULTIES = ["easy", "medium", "hard"];
const RECENT_SUBTYPE_BY_SCOPE = new Map();
const RECENT_SUBTYPE_HISTORY = 2;

const DIFFICULTY_GAMEPLAY_PROFILE = {
  easy: {
    readingLoad: "low",
    expectedSeconds: [2, 4],
    maxSteps: 1,
    visualComplexity: "low",
    pressure: "momentum",
  },
  medium: {
    readingLoad: "low-medium",
    expectedSeconds: [3, 6],
    maxSteps: 2,
    visualComplexity: "medium",
    pressure: "balanced",
  },
  hard: {
    readingLoad: "medium",
    expectedSeconds: [4, 8],
    maxSteps: 3,
    visualComplexity: "medium",
    pressure: "strategic",
  },
};

const MATCH_DURATION_BY_DIFFICULTY_SECONDS = {
  easy: 55,
  medium: 75,
  hard: 90,
};

const MATCH_DURATION_TOPIC_BONUS_SECONDS = {
  arithmetic: 0,
  algebra: 0,
  geometry: 5,
  fractions: 5,
  ratios: 0,
  exponents: 0,
  statistics: 5,
  trigonometry: 8,
  functions: 8,
  calculus: 10,
};

const { getRules, getQuestionTimerSeconds } = require("./difficulty-framework");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight ?? 1;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function simplifyFraction(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return { n: 0, d: 1 };
  if (n === 0) return { n: 0, d: 1 };
  const sign = d < 0 ? -1 : 1;
  const nn = n * sign;
  const dd = d * sign;
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

function formatFraction(n, d) {
  if (d === 1) return String(n);
  return `${n}/${d}`;
}

function parseFraction(value) {
  const s = String(value ?? "").trim();
  const m = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return simplifyFraction(n, d);
}

function parseLooseNumber(value) {
  const s = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/x/gi, "")
    .replace(/\s+/g, "")
    .replace(/%/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\u00b0/g, "")
    .replace(/%/g, "")
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/");
}

function isValidTopic(value) {
  return TOPICS.includes(value);
}

function isValidDifficulty(value) {
  return DIFFICULTIES.includes(value);
}

function buildNoRepeatKey(scopeKey, topic, difficulty) {
  return `${scopeKey ?? "global"}:${topic}:${difficulty}`;
}

function pickSubtype(families, scopeKey, topic, difficulty) {
  if (families.length === 1) return families[0];
  const key = buildNoRepeatKey(scopeKey, topic, difficulty);
  const prevHistory = RECENT_SUBTYPE_BY_SCOPE.get(key) ?? [];
  const recentSet = new Set(prevHistory);
  const candidates = families.filter((f) => !recentSet.has(f.subtype));
  const chosen = pickWeighted(candidates.length > 0 ? candidates : families);
  const nextHistory = [...prevHistory, chosen.subtype].slice(-RECENT_SUBTYPE_HISTORY);
  RECENT_SUBTYPE_BY_SCOPE.set(key, nextHistory);
  return chosen;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function countMatches(re, s) {
  const m = String(s ?? "").match(re);
  return m ? m.length : 0;
}

function estimateStepsFromPrompt(prompt) {
  const s = String(prompt ?? "");
  // Count visible operations (rough proxy for cognitive steps).
  const opCount =
    // Addition/subtraction: count only binary operators with spaces around (avoid unary negatives like "-3").
    countMatches(/(?:\s\+\s)|(?:\s-\s)/g, s) +
    // Multiplication: count only between numeric terms "A x B" or "×" (avoid variable "x").
    countMatches(/(?:\d+\s*[xX]\s*\d+)|\u00d7/g, s) +
    // Division: count only explicit operator " ÷ " or " / " (do NOT count fraction slashes like "3/4").
    countMatches(/(?:\s\/\s)|\u00f7|÷/g, s) +
    // Exponentiation: count only numeric exponent operations like "2^5" (avoid "x^2" inside calculus prompts).
    countMatches(/\d+\s*\^\s*\d+/g, s) +
    countMatches(/√/g, s);
  // Parentheses are formatting; don't add steps by themselves.
  return Math.max(1, Math.min(6, opCount));
}

function isNiceTerminatingDecimal(n, maxPlaces = 2) {
  if (!Number.isFinite(n)) return false;
  const m = 10 ** maxPlaces;
  return Math.abs(Math.round(n * m) - n * m) < 1e-9;
}

function isUglyDecimal(n) {
  // "Ugly" for this game's feel: long repeating-ish decimals.
  return Number.isFinite(n) && !Number.isInteger(n) && !isNiceTerminatingDecimal(n, 2);
}

function validateQuestionShape(topic, difficulty, built) {
  const rules = getRules(topic, difficulty);
  const prompt = String(built?.prompt ?? "");
  const steps = estimateStepsFromPrompt(prompt);

  if (!rules.allowBrackets && (prompt.includes("(") || prompt.includes(")"))) return false;
  if (steps > rules.maxSteps) return false;

  // Arithmetic easy: only +/-, small numbers, no multiplication/division.
  if (topic === "arithmetic" && difficulty === "easy") {
    if (/\bx\b|\u00d7|÷|\//.test(prompt)) return false;
  }

  // If explicit division is present but not allowed, reject.
  // NOTE: "/" appears in fractions like "3/4" so only treat " / " (spaced) as division.
  if (!rules.allowDivision && (prompt.includes("÷") || /\s\/\s/.test(prompt))) return false;

  // Avoid negative answers when disallowed (best-effort on numeric answers).
  if (rules.allowNegativeAnswer === false) {
    const ans = Number(String(built?.answer ?? ""));
    if (Number.isFinite(ans) && ans < 0) return false;
  }

  return true;
}

function validateQuestion(topic, difficulty, built) {
  if (!validateQuestionShape(topic, difficulty, built)) return false;

  const prompt = String(built?.prompt ?? "").trim();
  const answerType = built?.answerType ?? "text";
  const answer = String(built?.answer ?? "").trim();
  if (!prompt || !answer) return false;

  // General cleanliness: avoid ugly decimals unless explicitly intended.
  if (answerType === "number" || answerType === "percent") {
    const n = parseLooseNumber(answer);
    if (n !== null && isUglyDecimal(n)) return false;
  }
  if (answerType === "int" || answerType === "angle") {
    const n = parseLooseNumber(answer);
    if (n === null || !Number.isFinite(n) || !Number.isInteger(n)) return false;
  }

  // Topic-specific guards.
  if (topic === "algebra") {
    // Ensure it reads like an algebra prompt.
    const lower = prompt.toLowerCase();
    if (!(lower.startsWith("solve") || lower.startsWith("evaluate"))) return false;
    if (lower.startsWith("solve") && !prompt.includes("=")) return false;
  }

  if (topic === "geometry") {
    // Must include the given measurements in text (so it's solvable without relying on the diagram renderer).
    if (!/\d/.test(prompt)) return false;
  }

  if (topic === "fractions") {
    // Fraction/percent prompts should not require messy decimals.
    if (/[.]\d{3,}/.test(answer)) return false;
  }

  if (topic === "trigonometry") {
    // Avoid random-degree trig without special values/triples.
    if (/sin|cos|tan/i.test(prompt) && answerType !== "fraction" && answerType !== "int" && answerType !== "number") {
      return false;
    }
  }

  return true;
}

function getMatchDurationSeconds(topic, difficulty) {
  const safeDifficulty = isValidDifficulty(difficulty) ? difficulty : "easy";
  const safeTopic = isValidTopic(topic) ? topic : "arithmetic";
  const base = MATCH_DURATION_BY_DIFFICULTY_SECONDS[safeDifficulty];
  const topicBonus = safeDifficulty === "easy" ? 0 : (MATCH_DURATION_TOPIC_BONUS_SECONDS[safeTopic] ?? 0);
  return clamp(base + topicBonus, 45, 120);
}

function createQuestion(topic, difficulty, subtype, built) {
  const now = Date.now().toString(36);
  const rand = randomInt(1000, 9999).toString(36);
  const answerType = built.answerType ?? "text";
  const inputMode = built.inputMode ?? (answerType === "text" ? "text" : "number");
  const acceptedAnswers = Array.isArray(built.acceptedAnswers)
    ? built.acceptedAnswers.map((x) => String(x)).filter(Boolean)
    : [];

  return {
    id: `${topic}-${subtype}-${difficulty}-${now}-${rand}`,
    topic,
    subtype,
    difficulty,
    prompt: String(built.prompt ?? "").trim(),
    answer: String(built.answer ?? "").trim(),
    acceptedAnswers,
    answerType,
    inputMode,
    timeSuitability: built.timeSuitability ?? "rapid",
    visualType: built.visualType ?? "none",
    diagramSpec: built.diagramSpec ?? null,
    formatting: {
      style: built.formatting?.style ?? "math",
      unit: built.formatting?.unit ?? null,
      expression: built.formatting?.expression ?? null,
    },
    unit: built.unit ?? null,
    gameplayDifficulty: {
      level: difficulty,
      rubric: DIFFICULTY_GAMEPLAY_PROFILE[difficulty],
    },
    timing: {
      expectedSolveSeconds: built.meta?.estimatedSeconds ?? 4,
      matchDurationSeconds: getMatchDurationSeconds(topic, difficulty),
      questionTimerSeconds: getQuestionTimerSeconds(topic, difficulty),
    },
    meta: {
      estimatedSeconds: built.meta?.estimatedSeconds ?? 4,
      tags: Array.isArray(built.meta?.tags) ? built.meta.tags : [],
    },
  };
}

function firstAnswer(question) {
  if (Array.isArray(question?.acceptedAnswers) && question.acceptedAnswers.length > 0) {
    return String(question.acceptedAnswers[0]);
  }
  return String(question?.answer ?? "");
}

function isCorrectAgainstType(userAnswer, expected, answerType) {
  if (answerType === "fraction") {
    const uf = parseFraction(userAnswer);
    const ef = parseFraction(expected);
    if (uf && ef) return uf.n === ef.n && uf.d === ef.d;
    const un = parseLooseNumber(userAnswer);
    const en = ef ? ef.n / ef.d : parseLooseNumber(expected);
    if (un === null || en === null) return false;
    return Math.abs(un - en) < 1e-9;
  }

  if (answerType === "int" || answerType === "angle") {
    const un = parseLooseNumber(userAnswer);
    const en = parseLooseNumber(expected);
    if (un === null || en === null) return false;
    return Math.trunc(un) === Math.trunc(en);
  }

  if (answerType === "number" || answerType === "percent") {
    const un = parseLooseNumber(userAnswer);
    const en = parseLooseNumber(expected);
    if (un === null || en === null) return false;
    return Math.abs(un - en) < 1e-9;
  }

  return normalizeText(userAnswer) === normalizeText(expected);
}

/**
 * Backward-compatible answer check:
 * - isCorrectAnswer(user, questionObject)
 * - isCorrectAnswer(user, answer, answerType)
 */
function isCorrectAnswer(userAnswer, questionOrAnswer, answerType = "text") {
  if (questionOrAnswer && typeof questionOrAnswer === "object") {
    const question = questionOrAnswer;
    const expectedAnswers = [question.answer, ...(question.acceptedAnswers ?? [])].map((x) => String(x));
    const type = question.answerType ?? answerType;
    return expectedAnswers.some((expected) => isCorrectAgainstType(userAnswer, expected, type));
  }
  return isCorrectAgainstType(userAnswer, String(questionOrAnswer ?? ""), answerType);
}

function normalizeAnswer(value) {
  return normalizeText(value);
}

function buildFamilyResult(topic, difficulty, subtype, built) {
  const normalizedBuilt =
    topic === "algebra"
      ? {
          ...built,
          prompt: normalizeAlgebraPrompt(String(built.prompt ?? "")),
        }
      : built;
  const question = createQuestion(topic, difficulty, subtype, normalizedBuilt);
  if (!question.prompt || !question.answer) {
    return createQuestion("arithmetic", difficulty, "fallback-add", {
      prompt: "7 + 8",
      answer: "15",
      answerType: "int",
      meta: { estimatedSeconds: 2, tags: ["fallback"] },
    });
  }
  return question;
}

function normalizeAlgebraPrompt(prompt) {
  const clean = String(prompt ?? "").trim();
  if (!clean) return "Solve: x + 1 = 3. x = ?";

  const lower = clean.toLowerCase();
  const hasInstruction =
    lower.startsWith("solve") ||
    lower.startsWith("evaluate") ||
    lower.startsWith("simplify") ||
    lower.startsWith("if x");

  if (hasInstruction) return clean;

  // Convert any algebra-like statement into an explicit Solve task.
  if (clean.includes("=") || clean.includes("x")) {
    return `Solve: ${clean}`;
  }

  return `Evaluate: ${clean}`;
}

function arithmeticLightning(difficulty) {
  const ranges = {
    easy: [0, 20],
    medium: [15, 80],
    hard: [30, 180],
  };
  const [min, max] = ranges[difficulty];
  const op = difficulty === "easy" ? pick(["+", "-"]) : pick(["+", "-", "x"]);
  if (op === "x") {
    const a = randomInt(3, difficulty === "easy" ? 9 : difficulty === "medium" ? 14 : 19);
    const b = randomInt(3, difficulty === "easy" ? 9 : difficulty === "medium" ? 14 : 19);
    return {
      prompt: `${a} x ${b}`,
      answer: String(a * b),
      answerType: "int",
      meta: { estimatedSeconds: 3, tags: ["mental", "speed"] },
    };
  }
  const a = randomInt(min, max);
  const b = randomInt(min, max);
  if (op === "+") {
    return { prompt: `${a} + ${b}`, answer: String(a + b), answerType: "int", meta: { estimatedSeconds: 2, tags: ["mental"] } };
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { prompt: `${hi} - ${lo}`, answer: String(hi - lo), answerType: "int", meta: { estimatedSeconds: 2, tags: ["mental"] } };
}

function arithmeticChain(difficulty) {
  // Medium/Hard only. Easy must never generate multi-step bracket chains.
  if (difficulty === "easy") {
    return arithmeticLightning("easy");
  }

  const a = randomInt(5, difficulty === "medium" ? 18 : 35);
  const b = randomInt(2, difficulty === "medium" ? 10 : 25);
  const c = randomInt(2, difficulty === "medium" ? 5 : 9);
  return {
    prompt: `(${a} + ${b}) x ${c}`,
    answer: String((a + b) * c),
    answerType: "int",
    meta: { estimatedSeconds: difficulty === "hard" ? 6 : 4, tags: ["chain"] },
  };
}

function arithmeticDivisionChain(difficulty) {
  // Hard only: clean integer division chains (no ugly decimals).
  const rules = getRules("arithmetic", difficulty);
  if (!rules.allowDivision) {
    return arithmeticChain("hard");
  }

  const divisor = pick([2, 3, 4, 5, 6, 8, 9, 10, 12]);
  const quotient = randomInt(4, 20);
  const a = divisor * quotient;
  const mult = randomInt(2, 6);
  const prompt = `${a} ÷ ${divisor} x ${mult}`;
  return {
    prompt,
    answer: String(quotient * mult),
    answerType: "int",
    formatting: { style: "math", expression: prompt },
    meta: { estimatedSeconds: 7, tags: ["division", "chain"] },
  };
}

function algebraSolveLinear(difficulty) {
  // Keep as a shared primitive for medium (ax + b = c) style.
  const x = randomInt(-9, 12);
  const a = randomInt(2, 9);
  const b = randomInt(-12, 12);
  const c = a * x + b;
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    prompt: `Solve: ${a}x ${bText} = ${c}`,
    answer: String(x),
    answerType: "int",
    formatting: { style: "math", expression: `${a}x ${bText} = ${c}` },
    meta: { estimatedSeconds: 5, tags: ["linear"] },
  };
}

function algebraEvaluate() {
  const x = randomInt(-5, 9);
  const a = randomInt(2, 7);
  const b = randomInt(-8, 12);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    prompt: `Evaluate: if x = ${x}, find ${a}x ${bText}`,
    answer: String(a * x + b),
    answerType: "int",
    formatting: { style: "math", expression: `${a}x ${bText}` },
    meta: { estimatedSeconds: 4, tags: ["substitute"] },
  };
}

function algebraEasyOneStep() {
  // x + b = c or x - b = c with small integers
  const x = randomInt(1, 12);
  const b = randomInt(1, 12);
  const plus = Math.random() < 0.5;
  const c = plus ? x + b : x - b;
  if (!plus && c < 0) return algebraEasyOneStep();
  const expr = plus ? `x + ${b} = ${c}` : `x - ${b} = ${c}`;
  return {
    prompt: `Solve: ${expr}`,
    answer: String(x),
    answerType: "int",
    formatting: { style: "math", expression: expr },
    meta: { estimatedSeconds: 3, tags: ["linear", "one-step"] },
  };
}

function algebraMediumTwoStep() {
  // ax + b = c with clean integer x
  const x = randomInt(-8, 12);
  const a = pick([2, 3, 4, 5, 6]);
  const b = randomInt(-12, 12);
  const c = a * x + b;
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const expr = `${a}x ${bText} = ${c}`;
  return {
    prompt: `Solve: ${expr}`,
    answer: String(x),
    answerType: "int",
    formatting: { style: "math", expression: expr },
    meta: { estimatedSeconds: 6, tags: ["linear", "two-step"] },
  };
}

function algebraHardBracketsOrBothSides() {
  // 3(x + k) = 2x + c  OR  ax + b = cx + d
  if (Math.random() < 0.6) {
    const x = randomInt(-8, 12);
    const a = pick([2, 3, 4, 5]);
    const c = pick([1, 2, 3]);
    if (a === c) return algebraHardBracketsOrBothSides();
    const b = randomInt(-10, 10);
    const d = randomInt(-10, 10);
    const left = a * x + b;
    const right = c * x + d;
    const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
    const dText = d >= 0 ? `+ ${d}` : `- ${Math.abs(d)}`;
    const expr = `${a}x ${bText} = ${c}x ${dText}`;
    if (left !== right) return algebraHardBracketsOrBothSides();
    return {
      prompt: `Solve: ${expr}`,
      answer: String(x),
      answerType: "int",
      formatting: { style: "math", expression: expr },
      meta: { estimatedSeconds: 8, tags: ["linear", "both-sides"] },
    };
  }

  const x = randomInt(-8, 12);
  const a = pick([2, 3, 4, 5]);
  const k = randomInt(-8, 10);
  const c = pick([1, 2, 3, 4]);
  const target = a * (x + k);
  const rhsConst = target - c * x;
  const kText = k >= 0 ? `+ ${k}` : `- ${Math.abs(k)}`;
  const rhsText = rhsConst >= 0 ? `+ ${rhsConst}` : `- ${Math.abs(rhsConst)}`;
  const expr = `${a}(x ${kText}) = ${c}x ${rhsText}`;
  return {
    prompt: `Solve: ${expr}`,
    answer: String(x),
    answerType: "int",
    formatting: { style: "math", expression: expr },
    meta: { estimatedSeconds: 9, tags: ["linear", "brackets"] },
  };
}

function geometryRectangle(difficulty) {
  const w = randomInt(3, difficulty === "easy" ? 11 : difficulty === "medium" ? 18 : 24);
  const h = randomInt(3, difficulty === "easy" ? 11 : difficulty === "medium" ? 18 : 24);
  const askArea = Math.random() < 0.5;
  return {
    prompt: askArea ? `Rectangle w=${w}, h=${h}. Area?` : `Rectangle w=${w}, h=${h}. Perimeter?`,
    answer: String(askArea ? w * h : 2 * (w + h)),
    answerType: "int",
    unit: "units",
    visualType: "shape",
    diagramSpec: { kind: "rectangle", width: w, height: h, labels: { width: `${w}`, height: `${h}` } },
    formatting: { style: "plain", unit: askArea ? "square units" : "units" },
    meta: { estimatedSeconds: 4, tags: ["geometry", "visual"] },
  };
}

function geometryTriangleArea(difficulty) {
  const base = randomInt(4, difficulty === "easy" ? 16 : difficulty === "medium" ? 22 : 30);
  const height = randomInt(3, difficulty === "easy" ? 14 : difficulty === "medium" ? 18 : 24);
  const area = (base * height) / 2;
  if (!Number.isInteger(area)) return geometryTriangleArea(difficulty);
  return {
    prompt: `Triangle base=${base}, height=${height}. Area?`,
    answer: String(area),
    answerType: "int",
    unit: "square units",
    visualType: "shape",
    diagramSpec: { kind: "triangle-area", base, height },
    formatting: { style: "plain", unit: "square units" },
    meta: { estimatedSeconds: difficulty === "hard" ? 7 : 5, tags: ["geometry", "area"] },
  };
}

function geometryTriangleAngle(difficulty) {
  const a = randomInt(25, difficulty === "easy" ? 80 : 95);
  const b = randomInt(20, difficulty === "easy" ? 70 : 85);
  return {
    prompt: `Triangle angles: ${a}°, ${b}°, ?. Find the missing angle.`,
    answer: String(180 - a - b),
    answerType: "angle",
    unit: "deg",
    visualType: "angle",
    diagramSpec: { kind: "triangle-angle", values: { a, b, c: "?" } },
    formatting: { style: "math", unit: "deg" },
    meta: { estimatedSeconds: 3, tags: ["angle", "visual"] },
  };
}

function geometryCircle(difficulty) {
  const r = pick(difficulty === "easy" ? [2, 3, 4, 5] : difficulty === "medium" ? [3, 4, 5, 6, 7] : [4, 5, 6, 7, 8]);
  const ask = pick(["diameter", "radius"]);
  const givenLabel = ask === "diameter" ? `radius=${r}` : `diameter=${r * 2}`;
  return {
    prompt: ask === "diameter" ? `Circle ${givenLabel}. Diameter?` : `Circle ${givenLabel}. Radius?`,
    answer: ask === "diameter" ? String(r * 2) : String(r),
    answerType: "int",
    unit: "units",
    visualType: "shape",
    diagramSpec: { kind: "circle", radius: ask === "diameter" ? r : r * 2, showDiameter: true, label: ask === "diameter" ? `r=${r}` : `d=${r * 2}` },
    formatting: { style: "plain", unit: "units" },
    meta: { estimatedSeconds: 2, tags: ["circle", "visual"] },
  };
}

function fractionsAddLikeDenominator(difficulty) {
  const d = pick(difficulty === "easy" ? [2, 3, 4, 5, 8] : difficulty === "medium" ? [3, 4, 5, 6, 8, 10] : [5, 6, 8, 10, 12]);
  const a = randomInt(1, d - 1);
  const b = randomInt(1, d - 1);
  const s = simplifyFraction(a + b, d);
  return {
    prompt: `${a}/${d} + ${b}/${d}`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: s.d !== 1 ? [String(s.n / s.d)] : [],
    answerType: "fraction",
    visualType: "fraction_bar",
    diagramSpec: { kind: "fraction-bars", denominator: d, numerators: [a, b], operation: "+" },
    formatting: { style: "math", expression: `${a}/${d} + ${b}/${d}` },
    meta: { estimatedSeconds: 4, tags: ["fraction", "visual"] },
  };
}

function fractionsSubtractLikeDenominator(difficulty) {
  const d = pick(difficulty === "easy" ? [2, 3, 4, 5, 8] : difficulty === "medium" ? [3, 4, 5, 6, 8, 10] : [5, 6, 8, 10, 12]);
  const a = randomInt(1, d - 1);
  const b = randomInt(1, a);
  const s = simplifyFraction(a - b, d);
  return {
    prompt: `${a}/${d} - ${b}/${d}`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: s.d !== 1 ? [String(s.n / s.d)] : [],
    answerType: "fraction",
    visualType: "fraction_bar",
    diagramSpec: { kind: "fraction-bars", denominator: d, numerators: [a, b], operation: "-" },
    formatting: { style: "math", expression: `${a}/${d} - ${b}/${d}` },
    meta: { estimatedSeconds: 4, tags: ["fraction"] },
  };
}

function fractionsMultiply(difficulty) {
  const a = randomInt(1, 5);
  const b = randomInt(2, difficulty === "medium" ? 8 : 12);
  const c = randomInt(1, 5);
  const d = randomInt(2, difficulty === "medium" ? 8 : 12);
  const s = simplifyFraction(a * c, b * d);
  return {
    prompt: `${a}/${b} x ${c}/${d}`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: s.d !== 1 ? [String(s.n / s.d)] : [],
    answerType: "fraction",
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 7 : 5, tags: ["fraction", "multiply"] },
  };
}

function fractionsDivide(difficulty) {
  const a = randomInt(1, 5);
  const b = randomInt(2, difficulty === "medium" ? 8 : 12);
  const c = randomInt(1, 5);
  const d = randomInt(2, difficulty === "medium" ? 8 : 12);
  const s = simplifyFraction(a * d, b * c);
  return {
    prompt: `${a}/${b} ÷ ${c}/${d}`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: s.d !== 1 ? [String(s.n / s.d)] : [],
    answerType: "fraction",
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 8 : 6, tags: ["fraction", "divide"] },
  };
}

function percentOfNumber(difficulty) {
  const percent = pick(difficulty === "easy" ? [10, 20, 25, 50] : difficulty === "medium" ? [5, 10, 12, 15, 20, 25, 30, 40, 50] : [6, 8, 12, 15, 18, 22, 24, 28, 35, 45]);
  const base = randomInt(difficulty === "easy" ? 10 : 20, difficulty === "easy" ? 120 : difficulty === "medium" ? 220 : 320);
  // Ensure clean integer result.
  const result = (percent * base) / 100;
  if (!Number.isInteger(result)) return percentOfNumber(difficulty);
  return {
    prompt: `${percent}% of ${base}`,
    answer: String(result),
    answerType: "int",
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 7 : 5, tags: ["percent"] },
  };
}

function fractionsOfNumber() {
  const numerator = pick([1, 2, 3, 4]);
  const denominator = pick([2, 3, 4, 5, 6, 8]);
  const base = denominator * randomInt(2, 24);
  return {
    prompt: `${numerator}/${denominator} of ${base}`,
    answer: String((numerator * base) / denominator),
    answerType: "int",
    visualType: "fraction_bar",
    diagramSpec: { kind: "fraction-of-number", numerator, denominator, whole: base },
    formatting: { style: "math" },
    meta: { estimatedSeconds: 4, tags: ["fraction"] },
  };
}

function fractionsCompare(difficulty) {
  const d1 = pick([2, 3, 4, 5, 6, 8]);
  const d2 = pick([2, 3, 4, 5, 6, 8]);
  const n1 = randomInt(1, d1 - 1);
  const n2 = randomInt(1, d2 - 1);
  const left = n1 / d1;
  const right = n2 / d2;
  const answer = left === right ? "=" : left > right ? ">" : "<";
  return {
    prompt: `${n1}/${d1} ? ${n2}/${d2}`,
    answer,
    acceptedAnswers: answer === ">" ? ["gt"] : answer === "<" ? ["lt"] : ["eq"],
    answerType: "text",
    inputMode: "text",
    visualType: "number_line",
    diagramSpec: { kind: "fraction-compare-line", left: { n: n1, d: d1 }, right: { n: n2, d: d2 } },
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 6 : 4, tags: ["compare", "visual"] },
  };
}

function ratioScale(difficulty) {
  const x = randomInt(2, 12);
  const y = randomInt(2, 12);
  const k = randomInt(2, difficulty === "easy" ? 5 : 9);
  return {
    prompt: `${x}:${y} = ${x * k}: ?`,
    answer: String(y * k),
    answerType: "int",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 3, tags: ["ratio"] },
  };
}

function ratioSimplify(difficulty) {
  const a = randomInt(2, difficulty === "easy" ? 18 : 30);
  const b = randomInt(2, difficulty === "easy" ? 18 : 30);
  const g = gcd(a, b);
  const sa = a / g;
  const sb = b / g;
  if (g === 1) return ratioSimplify(difficulty);
  return {
    prompt: `Simplify ${a}:${b}`,
    answer: `${sa}:${sb}`,
    acceptedAnswers: [`${sa} : ${sb}`],
    answerType: "text",
    inputMode: "text",
    formatting: { style: "plain" },
    meta: { estimatedSeconds: 4, tags: ["ratio", "simplify"] },
  };
}

function ratioDivideInRatio(difficulty) {
  const r1 = randomInt(1, 5);
  const r2 = randomInt(2, 6);
  const sum = r1 + r2;
  const unit = randomInt(2, difficulty === "medium" ? 12 : 20);
  const total = unit * sum;
  const ask = pick(["first", "second"]);
  const part = ask === "first" ? unit * r1 : unit * r2;
  return {
    prompt: `Split ${total} in ratio ${r1}:${r2}. ${ask} part?`,
    answer: String(part),
    answerType: "int",
    formatting: { style: "plain" },
    meta: { estimatedSeconds: difficulty === "hard" ? 8 : 6, tags: ["ratio", "divide"] },
  };
}

function ratioPartWhole() {
  const red = randomInt(2, 9);
  const blue = randomInt(2, 9);
  const ask = pick(["red", "blue"]);
  const part = ask === "red" ? red : blue;
  const total = red + blue;
  const s = simplifyFraction(part, total);
  return {
    prompt: `Bag ratio R:B = ${red}:${blue}. Fraction ${ask}?`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: [String(part / total)],
    answerType: "fraction",
    visualType: "pattern",
    diagramSpec: { kind: "ratio-dots", red, blue, ask },
    formatting: { style: "math" },
    meta: { estimatedSeconds: 4, tags: ["ratio", "part-whole"] },
  };
}

function ratioUnitRate() {
  const unitPrice = randomInt(2, 24);
  const qty = randomInt(2, 12);
  return {
    prompt: `${unitPrice * qty} for ${qty} items. Cost per item?`,
    answer: String(unitPrice),
    answerType: "int",
    unit: "currency",
    formatting: { style: "plain", unit: "per item" },
    meta: { estimatedSeconds: 4, tags: ["unit-rate"] },
  };
}

function exponentPowerValue(difficulty) {
  const base = randomInt(2, difficulty === "easy" ? 6 : 10);
  const exp = difficulty === "easy" ? pick([2, 3]) : difficulty === "medium" ? pick([2, 3, 4]) : pick([3, 4, 5]);
  return {
    prompt: `${base}^${exp}`,
    answer: String(base ** exp),
    answerType: "int",
    formatting: { style: "math", expression: `${base}^${exp}` },
    meta: { estimatedSeconds: 4, tags: ["power"] },
  };
}

function exponentSquareRoot(difficulty) {
  const roots = difficulty === "easy" ? [2, 3, 4, 5, 6, 7, 8, 9] : [4, 5, 6, 7, 8, 9, 10, 11, 12];
  const r = pick(roots);
  return {
    prompt: `√(${r * r})`,
    answer: String(r),
    answerType: "int",
    formatting: { style: "math", expression: `√(${r * r})` },
    meta: { estimatedSeconds: 3, tags: ["root"] },
  };
}

function exponentRuleSameBase() {
  const a = randomInt(2, 8);
  const m = randomInt(2, 6);
  const n = randomInt(2, 6);
  const pow = m + n;
  return {
    prompt: `Simplify: ${a}^${m} x ${a}^${n}`,
    answer: `${a}^${pow}`,
    acceptedAnswers: [String(a ** pow)],
    answerType: "text",
    inputMode: "text",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 6, tags: ["exponent-rule"] },
  };
}

function statsSequence() {
  const a = randomInt(3, 30);
  const d = randomInt(2, 10);
  return {
    prompt: `${a}, ${a + d}, ${a + 2 * d}, ?`,
    answer: String(a + 3 * d),
    answerType: "int",
    visualType: "pattern",
    diagramSpec: { kind: "sequence-boxes", values: [a, a + d, a + 2 * d, "?"] },
    meta: { estimatedSeconds: 3, tags: ["sequence"] },
  };
}

function statsMean() {
  const a = randomInt(2, 18);
  const b = randomInt(2, 18);
  const c = randomInt(2, 18);
  const d = randomInt(2, 18);
  const mean = (a + b + c + d) / 4;
  return {
    prompt: `Mean of [${a}, ${b}, ${c}, ${d}]`,
    answer: Number.isInteger(mean) ? String(mean) : String(Math.round(mean * 10) / 10),
    answerType: Number.isInteger(mean) ? "int" : "number",
    meta: { estimatedSeconds: 4, tags: ["mean"] },
  };
}

function statsMedian(difficulty) {
  const count = difficulty === "easy" ? 5 : 7;
  const nums = Array.from({ length: count }, () => randomInt(1, difficulty === "easy" ? 15 : 25)).sort((a, b) => a - b);
  const med = nums[Math.floor(count / 2)];
  return {
    prompt: `Median of [${nums.join(", ")}]`,
    answer: String(med),
    answerType: "int",
    meta: { estimatedSeconds: difficulty === "hard" ? 7 : 5, tags: ["median"] },
  };
}

function statsMode(difficulty) {
  const base = Array.from({ length: 5 }, () => randomInt(1, difficulty === "easy" ? 12 : 18));
  const idx = randomInt(0, base.length - 1);
  base.push(base[idx]); // ensure a mode
  base.sort(() => Math.random() - 0.5);
  const mode = base[idx];
  return {
    prompt: `Mode of [${base.join(", ")}]`,
    answer: String(mode),
    answerType: "int",
    meta: { estimatedSeconds: difficulty === "hard" ? 7 : 5, tags: ["mode"] },
  };
}

function statsProbability() {
  const total = pick([4, 5, 6, 8, 10, 12]);
  const favorable = randomInt(1, total - 1);
  const s = simplifyFraction(favorable, total);
  return {
    prompt: `P(event) = ${favorable}/${total}, simplify`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: [String(favorable / total)],
    answerType: "fraction",
    visualType: "number_line",
    diagramSpec: { kind: "probability-line", favorable, total },
    formatting: { style: "math" },
    meta: { estimatedSeconds: 4, tags: ["probability"] },
  };
}

function trigMissingAngle(difficulty) {
  const base = randomInt(15, difficulty === "easy" ? 75 : 120);
  return {
    prompt: `Straight line angle pair: ${base} and ?`,
    answer: String(180 - base),
    answerType: "angle",
    unit: "deg",
    visualType: "angle",
    diagramSpec: { kind: "line-angle", known: base, unknownLabel: "?" },
    formatting: { style: "math", unit: "deg" },
    meta: { estimatedSeconds: 2, tags: ["supplementary", "visual"] },
  };
}

function trigRightRatio() {
  const triples = [{ a: 3, b: 4, c: 5 }, { a: 5, b: 12, c: 13 }, { a: 8, b: 15, c: 17 }];
  const t = pick(triples);
  const scale = pick([1, 2, 3]);
  const opp = t.a * scale;
  const hyp = t.c * scale;
  const s = simplifyFraction(opp, hyp);
  return {
    prompt: "sin(θ) = opp/hyp = ?",
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: [String(opp / hyp)],
    answerType: "fraction",
    visualType: "shape",
    diagramSpec: { kind: "right-triangle", sides: { opp, adj: t.b * scale, hyp }, ask: "sin" },
    formatting: { style: "math" },
    meta: { estimatedSeconds: 5, tags: ["trig", "ratio"] },
  };
}

function trigSpecialAngle() {
  const set = pick([
    { prompt: "sin(30) = ?", answer: "1/2", answerType: "fraction" },
    { prompt: "cos(60) = ?", answer: "1/2", answerType: "fraction" },
    { prompt: "tan(45) = ?", answer: "1", answerType: "int" },
  ]);
  return {
    ...set,
    acceptedAnswers: set.answer === "1/2" ? ["0.5"] : [],
    formatting: { style: "math" },
    meta: { estimatedSeconds: 2, tags: ["special-angle"] },
  };
}

function trigSolveMissingSide(difficulty) {
  // Use right triangle triples so answers are integers.
  const triples = [
    { opp: 3, adj: 4, hyp: 5 },
    { opp: 5, adj: 12, hyp: 13 },
    { opp: 8, adj: 15, hyp: 17 },
  ];
  const t = pick(triples);
  const scale = pick(difficulty === "medium" ? [1, 2, 3] : [2, 3, 4]);
  const opp = t.opp * scale;
  const adj = t.adj * scale;
  const hyp = t.hyp * scale;
  const ask = pick(["hyp", "opp", "adj"]);
  const given = ask === "hyp" ? { opp, adj } : ask === "opp" ? { adj, hyp } : { opp, hyp };
  const answer = ask === "hyp" ? hyp : ask === "opp" ? opp : adj;
  return {
    prompt: `Right triangle. opp=${given.opp ?? "?"}, adj=${given.adj ?? "?"}, hyp=${given.hyp ?? "?"}. Find ${ask}.`,
    answer: String(answer),
    answerType: "int",
    visualType: "shape",
    diagramSpec: { kind: "right-triangle", sides: { opp, adj, hyp }, ask },
    formatting: { style: "plain" },
    meta: { estimatedSeconds: difficulty === "hard" ? 9 : 7, tags: ["pythagoras", "trig"] },
  };
}

function functionsCoordinateValue() {
  const x = randomInt(-5, 5);
  const y = randomInt(-5, 5);
  const ask = pick(["x", "y"]);
  return {
    prompt: `Point P shown. ${ask}-coordinate of P?`,
    answer: String(ask === "x" ? x : y),
    answerType: "int",
    visualType: "coordinate",
    diagramSpec: { kind: "coordinate-point", x, y, label: "P", xRange: [-6, 6], yRange: [-6, 6] },
    formatting: { style: "plain" },
    meta: { estimatedSeconds: 3, tags: ["coordinate", "visual"] },
  };
}

function functionsSlope(difficulty) {
  const x1 = randomInt(-4, 2);
  const y1 = randomInt(-5, 5);
  const m = pick(difficulty === "easy" ? [-2, -1, 1, 2] : [-3, -2, -1, 1, 2, 3]);
  const dx = pick([1, 2, 3]);
  const x2 = x1 + dx;
  const y2 = y1 + m * dx;
  return {
    prompt: "Slope of line through A and B?",
    answer: String(m),
    answerType: "int",
    visualType: "coordinate",
    diagramSpec: { kind: "coordinate-two-points", a: { x: x1, y: y1, label: "A" }, b: { x: x2, y: y2, label: "B" }, xRange: [-6, 6], yRange: [-8, 8] },
    formatting: { style: "math" },
    meta: { estimatedSeconds: 5, tags: ["slope", "visual"] },
  };
}

function functionsLinearEval() {
  const a = randomInt(2, 8);
  const b = randomInt(-6, 8);
  const x = randomInt(-4, 6);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    prompt: `f(x) = ${a}x ${bText}, f(${x}) = ?`,
    answer: String(a * x + b),
    answerType: "int",
    formatting: { style: "math", expression: `f(x) = ${a}x ${bText}` },
    meta: { estimatedSeconds: 4, tags: ["function"] },
  };
}

function functionsTransformEval(difficulty) {
  // Given f(x)=ax+b, evaluate f(x+k) at some x.
  const a = pick([2, 3, 4, 5]);
  const b = randomInt(-6, 8);
  const k = randomInt(1, difficulty === "medium" ? 4 : 6);
  const x = randomInt(-4, 6);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const prompt = `f(x) = ${a}x ${bText}. Find f(${x + k}).`;
  const answer = a * (x + k) + b;
  return {
    prompt,
    answer: String(answer),
    answerType: "int",
    formatting: { style: "math", expression: `f(x) = ${a}x ${bText}` },
    meta: { estimatedSeconds: difficulty === "hard" ? 9 : 7, tags: ["transform", "function"] },
  };
}

function functionsCompose(difficulty) {
  // f(x)=ax+b, g(x)=x+c, ask f(g(t))
  const a = pick([2, 3, 4]);
  const b = randomInt(-6, 8);
  const c = randomInt(-4, 6);
  const t = randomInt(-3, 5);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const cText = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
  const prompt = `f(x) = ${a}x ${bText}, g(x) = x ${cText}. Find f(g(${t})).`;
  const answer = a * (t + c) + b;
  return {
    prompt,
    answer: String(answer),
    answerType: "int",
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 10 : 8, tags: ["compose", "function"] },
  };
}

function calcDerivativeQuick(difficulty) {
  const a = randomInt(2, difficulty === "easy" ? 5 : 8);
  const p = pick(difficulty === "easy" ? [2, 3] : [2, 3, 4]);
  const coeff = a * p;
  const power = p - 1;
  return {
    prompt: `d/dx (${a}x^${p})`,
    answer: power === 1 ? `${coeff}x` : `${coeff}x^${power}`,
    answerType: "text",
    inputMode: "text",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 5, tags: ["derivative"] },
  };
}

function calcDerivativePolynomial(difficulty) {
  // d/dx (ax^n + bx + c) with small coefficients
  const a = randomInt(2, difficulty === "medium" ? 6 : 8);
  const n = pick(difficulty === "medium" ? [2, 3, 4] : [3, 4, 5]);
  const b = randomInt(1, 9);
  const c = randomInt(0, 9);
  const prompt = `d/dx (${a}x^${n} + ${b}x + ${c})`;
  const coeff = a * n;
  const pow = n - 1;
  const term1 = pow === 1 ? `${coeff}x` : `${coeff}x^${pow}`;
  const term2 = `${b}`;
  const answer = `${term1} + ${term2}`;
  return {
    prompt,
    answer,
    answerType: "text",
    inputMode: "text",
    formatting: { style: "math" },
    meta: { estimatedSeconds: difficulty === "hard" ? 11 : 9, tags: ["derivative", "polynomial"] },
  };
}

function calcDerivativeChainRule() {
  // d/dx ( (ax+b)^n ) with integer simplification
  const a = pick([2, 3, 4, 5]);
  const b = randomInt(-6, 8);
  const n = pick([2, 3, 4]);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const coeff = a * n;
  const pow = n - 1;
  const inside = `( ${a}x ${bText} )`;
  const answer = pow === 1 ? `${coeff}${inside}` : `${coeff}${inside}^${pow}`;
  return {
    prompt: `d/dx (${inside}^${n})`,
    answer,
    answerType: "text",
    inputMode: "text",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 12, tags: ["derivative", "chain-rule"] },
  };
}

function calcDefiniteIntegral() {
  const a = pick([2, 4, 6, 8, 10]);
  const upper = pick([1, 2, 3]);
  const s = simplifyFraction(a * upper * upper, 2);
  return {
    prompt: `Integral from 0 to ${upper} of ${a}x dx`,
    answer: formatFraction(s.n, s.d),
    acceptedAnswers: [String((a * upper * upper) / 2)],
    answerType: s.d === 1 ? "int" : "fraction",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 5, tags: ["integral"] },
  };
}

function calcRateOfChange() {
  const a = randomInt(2, 7);
  const b = randomInt(-6, 8);
  const x1 = randomInt(-2, 3);
  const x2 = x1 + pick([1, 2, 3]);
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    prompt: `Average rate of change from x=${x1} to x=${x2} for y=${a}x ${bText}`,
    answer: String(a),
    answerType: "int",
    formatting: { style: "math" },
    meta: { estimatedSeconds: 4, tags: ["rate-of-change"] },
  };
}

const BANK = {
  arithmetic: {
    easy: [{ subtype: "lightning-arithmetic", weight: 8, build: arithmeticLightning }],
    medium: [
      { subtype: "lightning-arithmetic", weight: 6, build: arithmeticLightning },
      { subtype: "operation-chain", weight: 4, build: arithmeticChain },
    ],
    hard: [
      { subtype: "lightning-arithmetic", weight: 4, build: arithmeticLightning },
      { subtype: "operation-chain", weight: 4, build: arithmeticChain },
      { subtype: "division-chain", weight: 2, build: arithmeticDivisionChain },
    ],
  },
  algebra: {
    easy: [
      { subtype: "solve-one-step", weight: 7, build: algebraEasyOneStep },
      { subtype: "evaluate-expression", weight: 3, build: algebraEvaluate },
    ],
    medium: [
      { subtype: "solve-two-step", weight: 7, build: algebraMediumTwoStep },
      { subtype: "evaluate-expression", weight: 3, build: algebraEvaluate },
    ],
    hard: [
      { subtype: "solve-brackets-both-sides", weight: 8, build: algebraHardBracketsOrBothSides },
      { subtype: "solve-two-step", weight: 2, build: algebraMediumTwoStep },
    ],
  },
  geometry: {
    easy: [
      { subtype: "rectangle-metrics", weight: 5, build: geometryRectangle },
      { subtype: "circle-radius-diameter", weight: 3, build: geometryCircle },
      { subtype: "triangle-missing-angle", weight: 2, build: geometryTriangleAngle },
    ],
    medium: [
      { subtype: "rectangle-metrics", weight: 4, build: geometryRectangle },
      { subtype: "triangle-area", weight: 4, build: geometryTriangleArea },
      { subtype: "triangle-missing-angle", weight: 2, build: geometryTriangleAngle },
    ],
    hard: [
      { subtype: "triangle-area", weight: 5, build: geometryTriangleArea },
      { subtype: "rectangle-metrics", weight: 3, build: geometryRectangle },
      { subtype: "triangle-missing-angle", weight: 2, build: geometryTriangleAngle },
    ],
  },
  fractions: {
    easy: [
      { subtype: "add-like-fractions", weight: 4, build: fractionsAddLikeDenominator },
      { subtype: "subtract-like-fractions", weight: 3, build: fractionsSubtractLikeDenominator },
      { subtype: "fraction-of-number", weight: 3, build: fractionsOfNumber },
    ],
    medium: [
      { subtype: "fraction-multiply", weight: 3, build: fractionsMultiply },
      { subtype: "fraction-divide", weight: 2, build: fractionsDivide },
      { subtype: "percent-of-number", weight: 3, build: percentOfNumber },
      { subtype: "compare-fractions", weight: 2, build: fractionsCompare },
    ],
    hard: [
      { subtype: "fraction-divide", weight: 3, build: fractionsDivide },
      { subtype: "fraction-multiply", weight: 2, build: fractionsMultiply },
      { subtype: "percent-of-number", weight: 3, build: percentOfNumber },
      { subtype: "compare-fractions", weight: 2, build: fractionsCompare },
    ],
  },
  ratios: {
    easy: [
      { subtype: "ratio-simplify", weight: 4, build: ratioSimplify },
      { subtype: "ratio-scale", weight: 3, build: ratioScale },
      { subtype: "unit-rate", weight: 3, build: ratioUnitRate },
    ],
    medium: [
      { subtype: "ratio-scale", weight: 3, build: ratioScale },
      { subtype: "divide-in-ratio", weight: 4, build: ratioDivideInRatio },
      { subtype: "ratio-part-whole", weight: 3, build: ratioPartWhole },
    ],
    hard: [
      { subtype: "divide-in-ratio", weight: 5, build: ratioDivideInRatio },
      { subtype: "unit-rate", weight: 3, build: ratioUnitRate },
      { subtype: "ratio-part-whole", weight: 2, build: ratioPartWhole },
    ],
  },
  exponents: {
    easy: [
      { subtype: "power-value", weight: 6, build: exponentPowerValue },
      { subtype: "square-root", weight: 4, build: exponentSquareRoot },
    ],
    medium: [
      { subtype: "square-root", weight: 4, build: exponentSquareRoot },
      { subtype: "power-value", weight: 4, build: exponentPowerValue },
      { subtype: "same-base-rule", weight: 2, build: exponentRuleSameBase },
    ],
    hard: [
      { subtype: "same-base-rule", weight: 5, build: exponentRuleSameBase },
      { subtype: "square-root", weight: 2, build: exponentSquareRoot },
      { subtype: "power-value", weight: 3, build: exponentPowerValue },
    ],
  },
  statistics: {
    easy: [
      { subtype: "mean-fast", weight: 6, build: statsMean },
      { subtype: "sequence-next", weight: 4, build: statsSequence },
    ],
    medium: [
      { subtype: "median", weight: 4, build: statsMedian },
      { subtype: "mode", weight: 3, build: statsMode },
      { subtype: "mean-fast", weight: 3, build: statsMean },
    ],
    hard: [
      { subtype: "median", weight: 4, build: statsMedian },
      { subtype: "mode", weight: 3, build: statsMode },
      { subtype: "probability-simplify", weight: 3, build: statsProbability },
    ],
  },
  trigonometry: {
    easy: [
      { subtype: "special-angle", weight: 6, build: trigSpecialAngle },
      { subtype: "right-triangle-ratio", weight: 4, build: trigRightRatio },
    ],
    medium: [
      { subtype: "solve-missing-side", weight: 6, build: trigSolveMissingSide },
      { subtype: "right-triangle-ratio", weight: 2, build: trigRightRatio },
      { subtype: "special-angle", weight: 2, build: trigSpecialAngle },
    ],
    hard: [
      { subtype: "solve-missing-side", weight: 7, build: trigSolveMissingSide },
      { subtype: "right-triangle-ratio", weight: 3, build: trigRightRatio },
    ],
  },
  functions: {
    easy: [
      { subtype: "function-eval", weight: 7, build: functionsLinearEval },
      { subtype: "coordinate-value", weight: 3, build: functionsCoordinateValue },
    ],
    medium: [
      { subtype: "line-slope", weight: 3, build: functionsSlope },
      { subtype: "transform-eval", weight: 5, build: functionsTransformEval },
      { subtype: "function-eval", weight: 2, build: functionsLinearEval },
    ],
    hard: [
      { subtype: "compose-functions", weight: 6, build: functionsCompose },
      { subtype: "line-slope", weight: 2, build: functionsSlope },
      { subtype: "transform-eval", weight: 2, build: functionsTransformEval },
    ],
  },
  calculus: {
    easy: [
      { subtype: "derivative-power-rule", weight: 7, build: calcDerivativeQuick },
      { subtype: "rate-of-change", weight: 3, build: calcRateOfChange },
    ],
    medium: [
      { subtype: "derivative-polynomial", weight: 6, build: calcDerivativePolynomial },
      { subtype: "definite-integral-linear", weight: 4, build: calcDefiniteIntegral },
    ],
    hard: [
      { subtype: "derivative-chain-rule", weight: 7, build: calcDerivativeChainRule },
      { subtype: "definite-integral-linear", weight: 3, build: calcDefiniteIntegral },
    ],
  },
};

function generateQuestion(topic, difficulty, scopeKey = "global") {
  const safeTopic = isValidTopic(topic) ? topic : "arithmetic";
  const safeDifficulty = isValidDifficulty(difficulty) ? difficulty : "easy";
  const topicBank = BANK[safeTopic];
  const families = topicBank?.[safeDifficulty] ?? BANK.arithmetic.easy;
  const family = pickSubtype(families, scopeKey, safeTopic, safeDifficulty);

  // Safety net: regenerate until the question matches the declared difficulty rules.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const built = family.build(safeDifficulty);
    if (!validateQuestion(safeTopic, safeDifficulty, built)) {
      continue;
    }
    return buildFamilyResult(safeTopic, safeDifficulty, family.subtype, built);
  }

  // Fallback if a generator is misconfigured.
  return createQuestion("arithmetic", safeDifficulty, "fallback-add", {
    prompt: safeDifficulty === "hard" ? "(13 + 14) x 4" : safeDifficulty === "medium" ? "(5 + 3) x 2" : "7 + 8",
    answer: safeDifficulty === "hard" ? "108" : safeDifficulty === "medium" ? "16" : "15",
    answerType: "int",
    meta: { estimatedSeconds: 3, tags: ["fallback", "validated"] },
  });
}

const QUESTION_CURRICULUM = {
  philosophy: { readingLoad: "low", solveWindowSeconds: [2, 6], mode: "rapid-fire-duel" },
  difficultyRubric: DIFFICULTY_GAMEPLAY_PROFILE,
  topics: {
    arithmetic: ["lightning-arithmetic", "operation-chain"],
    algebra: ["solve-linear", "evaluate-expression"],
    geometry: ["rectangle-metrics", "triangle-missing-angle", "circle-radius-diameter"],
    fractions: ["add-like-fractions", "fraction-of-number", "compare-fractions"],
    ratios: ["ratio-scale", "ratio-part-whole", "unit-rate"],
    exponents: ["power-value", "square-root", "same-base-rule"],
    statistics: ["sequence-next", "mean-fast", "probability-simplify"],
    trigonometry: ["line-missing-angle", "right-triangle-ratio", "special-angle"],
    functions: ["coordinate-value", "line-slope", "function-eval"],
    calculus: ["derivative-power-rule", "definite-integral-linear", "rate-of-change"],
  },
};

module.exports = {
  TOPICS,
  DIFFICULTIES,
  DIFFICULTY_GAMEPLAY_PROFILE,
  QUESTION_CURRICULUM,
  getMatchDurationSeconds,
  getQuestionTimerSeconds,
  generateQuestion,
  validateQuestion,
  validateQuestionShape,
  estimateStepsFromPrompt,
  normalizeAnswer,
  isCorrectAnswer,
  isValidTopic,
  isValidDifficulty,
  firstAnswer,
};
