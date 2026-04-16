/**
 * Shared question engine (server + web).
 *
 * Design goals:
 * - Topic-accurate school-math taxonomy
 * - Difficulty that meaningfully changes reasoning (not just number size)
 * - Short, PvP-friendly prompts
 * - Extensible: add new families by appending generators to BANK
 *
 * Exported API:
 * - TOPICS, DIFFICULTIES
 * - isValidTopic, isValidDifficulty
 * - generateQuestion(topic, difficulty, scopeKey?)
 * - normalizeAnswer(value)
 * - isCorrectAnswer(userAnswer, questionAnswer, answerType?)
 */

/** @typedef {"easy"|"medium"|"hard"} Difficulty */
/** @typedef {"arithmetic"|"algebra"|"geometry"|"fractions"|"ratios"|"exponents"|"statistics"|"trigonometry"|"functions"|"calculus"} Topic */
/** @typedef {"int"|"number"|"fraction"|"percent"|"text"|"angle"} AnswerType */
/**
 * @typedef {Object} GeneratedQuestion
 * @property {string} prompt
 * @property {string} answer
 * @property {Topic} topic
 * @property {Difficulty} difficulty
 * @property {string} familyId
 * @property {AnswerType} answerType
 */

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

// ---------------------------------------------------------------------------
// RNG + selection utilities
// ---------------------------------------------------------------------------

const RECENT_FAMILY_BY_SCOPE = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function pickWeighted(items) {
  const total = items.reduce((sum, it) => sum + (it.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight ?? 1;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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
  if (d === 0) return { n: 0, d: 1 };
  if (n === 0) return { n: 0, d: 1 };
  const sign = Math.sign(d) < 0 ? -1 : 1;
  const nn = n * sign;
  const dd = d * sign;
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

function formatFraction(n, d) {
  if (d === 1) return String(n);
  return `${n}/${d}`;
}

function parseFraction(str) {
  const s = String(str).trim();
  const m = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return simplifyFraction(n, d);
}

function parseNumberLoose(str) {
  const s = String(str)
    .trim()
    .replace(/,/g, "")
    .replace(/×/g, "x")
    .replace(/÷/g, "/");
  if (!s) return null;
  // percent sign handled elsewhere
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return v;
}

function buildNoRepeatKey(scopeKey, topic, difficulty) {
  return `${scopeKey ?? "global"}:${topic}:${difficulty}`;
}

function pickFamily(families, scopeKey, topic, difficulty) {
  if (families.length === 1) return families[0];
  const key = buildNoRepeatKey(scopeKey, topic, difficulty);
  const prev = RECENT_FAMILY_BY_SCOPE.get(key);
  const candidates = families.filter((f) => f.id !== prev);
  const chosen = pickWeighted(candidates.length > 0 ? candidates : families);
  RECENT_FAMILY_BY_SCOPE.set(key, chosen.id);
  return chosen;
}

function ensureInt(n) {
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// ---------------------------------------------------------------------------
// Answer normalization + validation
// ---------------------------------------------------------------------------

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/%/g, "");
}

function isCorrectAnswer(userAnswer, correctAnswer, answerType = "text") {
  const uRaw = String(userAnswer ?? "").trim();
  const cRaw = String(correctAnswer ?? "").trim();
  if (!uRaw) return false;

  if (answerType === "fraction") {
    const uf = parseFraction(uRaw);
    const cf = parseFraction(cRaw);
    if (uf && cf) return uf.n === cf.n && uf.d === cf.d;
    // Allow decimal equivalent (e.g. 0.5 for 1/2) within tight tolerance
    const un = parseNumberLoose(normalizeAnswer(uRaw));
    const cn = cf ? cf.n / cf.d : parseNumberLoose(normalizeAnswer(cRaw));
    if (un === null || cn === null) return false;
    return Math.abs(un - cn) < 1e-9;
  }

  if (answerType === "int" || answerType === "number" || answerType === "angle") {
    const un = parseNumberLoose(normalizeAnswer(uRaw));
    const cn = parseNumberLoose(normalizeAnswer(cRaw));
    if (un === null || cn === null) return false;
    const tol = answerType === "number" ? 1e-9 : 0;
    return Math.abs(un - cn) <= tol;
  }

  if (answerType === "percent") {
    // Accept "25" or "25%" from user; normalizeAnswer strips '%'
    const un = parseNumberLoose(normalizeAnswer(uRaw));
    const cn = parseNumberLoose(normalizeAnswer(cRaw));
    if (un === null || cn === null) return false;
    return Math.abs(un - cn) < 1e-9;
  }

  return normalizeAnswer(uRaw) === normalizeAnswer(cRaw);
}

function isValidTopic(value) {
  return TOPICS.includes(value);
}

function isValidDifficulty(value) {
  return DIFFICULTIES.includes(value);
}

// ---------------------------------------------------------------------------
// Family builders (topic-accurate, PvP-friendly)
// ---------------------------------------------------------------------------

/** @typedef {(difficulty: Difficulty) => {prompt: string, answer: string, answerType?: AnswerType}} FamilyBuilder */

function q(topic, difficulty, familyId, built) {
  return {
    prompt: built.prompt,
    answer: built.answer,
    topic,
    difficulty,
    familyId,
    answerType: built.answerType ?? "text",
  };
}

// -------------------- Arithmetic --------------------

/** @type {FamilyBuilder} */
function arith_oneStep(difficulty) {
  const ops = difficulty === "easy"
    ? ["+", "-", "×"]
    : difficulty === "medium"
      ? ["+", "-", "×", "÷"]
      : ["+", "-", "×", "÷"];
  const op = pick(ops);
  const max = difficulty === "easy" ? 30 : difficulty === "medium" ? 120 : 250;
  const a = randomInt(2, max);
  const b = randomInt(2, max);
  if (op === "+") return { prompt: `${a} + ${b}`, answer: String(a + b), answerType: "int" };
  if (op === "-") {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return { prompt: `${hi} - ${lo}`, answer: String(hi - lo), answerType: "int" };
  }
  if (op === "×") {
    const mMax = difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 28;
    const x = randomInt(2, mMax);
    const y = randomInt(2, mMax);
    return { prompt: `${x} × ${y}`, answer: String(x * y), answerType: "int" };
  }
  // division -> force integer
  const divisor = randomInt(2, difficulty === "easy" ? 10 : difficulty === "medium" ? 14 : 18);
  const quotient = randomInt(2, difficulty === "easy" ? 14 : difficulty === "medium" ? 22 : 28);
  const dividend = divisor * quotient;
  return { prompt: `${dividend} ÷ ${divisor}`, answer: String(quotient), answerType: "int" };
}

/** @type {FamilyBuilder} */
function arith_bodmas(difficulty) {
  if (difficulty === "easy") {
    const a = randomInt(2, 15);
    const b = randomInt(2, 8);
    const c = randomInt(2, 8);
    return { prompt: `${a} + ${b} × ${c}`, answer: String(a + b * c), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(3, 18);
    const b = randomInt(2, 12);
    const c = randomInt(2, 12);
    const d = randomInt(2, 12);
    // (a + b) × c - d
    return {
      prompt: `(${a} + ${b}) × ${c} - ${d}`,
      answer: String((a + b) * c - d),
      answerType: "int",
    };
  }
  // hard: negatives + multi-step
  const a = randomInt(5, 25);
  const b = randomInt(3, 14);
  const c = randomInt(2, 10);
  const d = randomInt(3, 20);
  const sign = pick([-1, 1]);
  const x = sign * a;
  // x - (b × c) + d
  return { prompt: `${x} - (${b} × ${c}) + ${d}`, answer: String(x - b * c + d), answerType: "int" };
}

/** @type {FamilyBuilder} */
function arith_decimalFractionMix(difficulty) {
  if (difficulty === "easy") {
    // quick decimal addition
    const a = randomInt(10, 99) / 10; // 1.0..9.9
    const b = randomInt(10, 99) / 10;
    const ans = Math.round((a + b) * 10) / 10;
    return { prompt: `${a} + ${b}`, answer: String(ans), answerType: "number" };
  }
  if (difficulty === "medium") {
    const den = pick([2, 4, 5, 10]);
    const n = randomInt(1, den - 1);
    const frac = simplifyFraction(n, den);
    const base = randomInt(2, 20);
    const ans = base + frac.n / frac.d;
    // Keep to one decimal if denominator is 2,5,10; else exact fraction
    const useDecimal = den === 2 || den === 5 || den === 10;
    return {
      prompt: `${base} + ${formatFraction(frac.n, frac.d)}`,
      answer: useDecimal ? String(ans) : formatFraction(base * frac.d + frac.n, frac.d),
      answerType: useDecimal ? "number" : "fraction",
    };
  }
  // hard: mixed fraction/decimal two-step
  const den = pick([4, 8, 12]);
  const a = randomInt(1, den - 1);
  const b = randomInt(1, den - 1);
  const x = randomInt(12, 48) / 4; // .0/.25/.5/.75
  const sum = simplifyFraction(a + b, den);
  const ans = x - (sum.n / sum.d);
  // represent answer as fraction with denominator lcm(4, den)
  const l = (4 * den) / gcd(4, den);
  const xn = ensureInt(x * l);
  const sn = ensureInt((sum.n * l) / sum.d);
  const out = simplifyFraction(xn - sn, l);
  return {
    prompt: `${x} - (${formatFraction(a, den)} + ${formatFraction(b, den)})`,
    answer: formatFraction(out.n, out.d),
    answerType: "fraction",
  };
}

// -------------------- Algebra --------------------

/** @type {FamilyBuilder} */
function alg_solveOneStep(difficulty) {
  if (difficulty === "easy") {
    const x = randomInt(2, 18);
    if (Math.random() < 0.5) {
      const a = randomInt(1, 12);
      return { prompt: `x + ${a} = ${x + a}`, answer: String(x), answerType: "int" };
    }
    const a = randomInt(2, 9);
    return { prompt: `${a}x = ${a * x}`, answer: String(x), answerType: "int" };
  }
  if (difficulty === "medium") {
    const x = randomInt(-8, 14);
    const a = randomInt(2, 9);
    const b = randomInt(-12, 12);
    const c = a * x + b;
    const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
    return { prompt: `${a}x ${bText} = ${c}`, answer: String(x), answerType: "int" };
  }
  // hard: brackets
  const x = randomInt(-6, 12);
  const a = randomInt(2, 6);
  // Avoid b=0 identity edge cases (PvP fairness).
  const b = pick([-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // Ensure coefficient differs so equation actually constrains x.
  let c = randomInt(2, 6);
  if (c === a) c = a === 6 ? 5 : a + 1;
  const d = randomInt(-12, 12);
  const left = a * (x + b);
  const right = c * x + d;
  // choose d so that equation holds for x
  const dFix = left - c * x;
  const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const dText = dFix >= 0 ? `+ ${dFix}` : `- ${Math.abs(dFix)}`;
  return { prompt: `${a}(x ${bText}) = ${c}x ${dText}`, answer: String(x), answerType: "int" };
}

/** @type {FamilyBuilder} */
function alg_simplifyLikeTerms(difficulty) {
  const a = randomInt(1, difficulty === "easy" ? 6 : difficulty === "medium" ? 9 : 12);
  const b = randomInt(1, difficulty === "easy" ? 6 : difficulty === "medium" ? 9 : 12);
  const c = randomInt(0, difficulty === "easy" ? 10 : difficulty === "medium" ? 18 : 28);
  const d = randomInt(0, difficulty === "easy" ? 10 : difficulty === "medium" ? 18 : 28);
  // (ax + c) + (bx + d)
  return { prompt: `Simplify: ${a}x + ${c} + ${b}x + ${d}`, answer: `${a + b}x+${c + d}`, answerType: "text" };
}

/** @type {FamilyBuilder} */
function alg_substitute(difficulty) {
  const x = randomInt(difficulty === "easy" ? 1 : -6, difficulty === "easy" ? 9 : difficulty === "medium" ? 10 : 12);
  if (difficulty === "easy") {
    const a = randomInt(2, 6);
    const b = randomInt(0, 12);
    return { prompt: `If x = ${x}, find ${a}x + ${b}`, answer: String(a * x + b), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(2, 7);
    const b = randomInt(-10, 10);
    const c = randomInt(2, 6);
    return { prompt: `If x = ${x}, find ${a}(x + ${b}) - ${c}`, answer: String(a * (x + b) - c), answerType: "int" };
  }
  const a = randomInt(2, 5);
  const b = randomInt(-8, 8);
  const c = randomInt(2, 5);
  const d = randomInt(-8, 8);
  // a(x+b) + c(x+d)
  return {
    prompt: `If x = ${x}, find ${a}(x + ${b}) + ${c}(x + ${d})`,
    answer: String(a * (x + b) + c * (x + d)),
    answerType: "int",
  };
}

// -------------------- Geometry --------------------

/** @type {FamilyBuilder} */
function geo_areaPerimeter(difficulty) {
  const w = randomInt(2, difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 35);
  const h = randomInt(2, difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 35);
  const isArea = Math.random() < 0.5;
  if (isArea) return { prompt: `Area of ${w}×${h} rectangle`, answer: String(w * h), answerType: "int" };
  return { prompt: `Perimeter of ${w}×${h} rectangle`, answer: String(2 * (w + h)), answerType: "int" };
}

/** @type {FamilyBuilder} */
function geo_angles(difficulty) {
  if (difficulty === "easy") {
    const a = randomInt(20, 140);
    return { prompt: `Straight line: 180 - ${a}`, answer: String(180 - a), answerType: "angle" };
  }
  if (difficulty === "medium") {
    const a = randomInt(20, 80);
    const b = randomInt(20, 80);
    const c = 180 - a - b;
    return { prompt: `Triangle angles: ${a}°, ${b}°, ?`, answer: String(c), answerType: "angle" };
  }
  // hard: interior angle in a regular polygon (simple)
  const sides = pick([5, 6, 8, 10, 12]);
  const interior = ((sides - 2) * 180) / sides;
  return { prompt: `Interior angle of regular ${sides}-gon`, answer: String(interior), answerType: "angle" };
}

/** @type {FamilyBuilder} */
function geo_pythagorasVolume(difficulty) {
  if (difficulty === "easy") {
    const r = pick([3, 4, 5, 6, 7]);
    return { prompt: `Square with side ${r}: area`, answer: String(r * r), answerType: "int" };
  }
  if (difficulty === "medium") {
    // Pythagoras with triples
    const triple = pick([
      { a: 3, b: 4, c: 5 },
      { a: 5, b: 12, c: 13 },
      { a: 8, b: 15, c: 17 },
    ]);
    const k = pick([1, 2, 3]);
    const A = triple.a * k;
    const B = triple.b * k;
    const C = triple.c * k;
    return { prompt: `Right triangle: legs ${A}, ${B}. hypotenuse?`, answer: String(C), answerType: "int" };
  }
  // hard: volume
  const l = randomInt(3, 12);
  const w = randomInt(3, 12);
  const h = randomInt(3, 12);
  return { prompt: `Volume of ${l}×${w}×${h} cuboid`, answer: String(l * w * h), answerType: "int" };
}

// -------------------- Fractions / Decimals / Percentages --------------------

/** @type {FamilyBuilder} */
function frac_simplifyConvertPercent(difficulty) {
  if (difficulty === "easy") {
    if (Math.random() < 0.5) {
      const d = pick([4, 6, 8, 10, 12]);
      const f = pick([2, 3]);
      const n0 = randomInt(1, Math.floor((d / f) - 1)) * f;
      const simp = simplifyFraction(n0, d);
      return { prompt: `Simplify ${n0}/${d}`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
    }
    const pct = pick([10, 20, 25, 50, 75]);
    return { prompt: `${pct}% as a decimal`, answer: String(pct / 100), answerType: "number" };
  }
  if (difficulty === "medium") {
    const p = pick([12.5, 37.5, 62.5, 87.5]);
    return { prompt: `${p}% as a fraction (simplify)`, answer: (() => {
      const frac = simplifyFraction(ensureInt(p * 10), 1000);
      return formatFraction(frac.n, frac.d);
    })(), answerType: "fraction" };
  }
  // hard: percent increase/decrease (multi-step but short)
  const base = pick([80, 120, 150, 200, 240, 320]);
  const pct = pick([12, 15, 25, 35, 45]);
  const dirUp = Math.random() < 0.5;
  const out = Math.round(base * (dirUp ? 1 + pct / 100 : 1 - pct / 100));
  return { prompt: `${base} ${dirUp ? "increased" : "decreased"} by ${pct}%`, answer: String(out), answerType: "int" };
}

/** @type {FamilyBuilder} */
function frac_operations(difficulty) {
  const d = difficulty === "easy" ? pick([2, 4, 5, 8]) : difficulty === "medium" ? pick([3, 4, 6, 8, 10]) : pick([6, 8, 10, 12]);
  if (difficulty === "easy") {
    const a = randomInt(1, d - 1);
    const b = randomInt(1, d - 1);
    const simp = simplifyFraction(a + b, d);
    return { prompt: `${a}/${d} + ${b}/${d}`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
  }
  if (difficulty === "medium") {
    const a = randomInt(1, d - 1);
    const b = randomInt(1, d - 1);
    const simp = simplifyFraction(a - b, d);
    return { prompt: `${a}/${d} - ${b}/${d}`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
  }
  // hard: multiply/divide fractions
  const d2 = pick([3, 4, 5, 6, 8, 10, 12]);
  const a = randomInt(1, d - 1);
  const b = randomInt(1, d2 - 1);
  const op = Math.random() < 0.5 ? "×" : "÷";
  if (op === "×") {
    const simp = simplifyFraction(a * b, d * d2);
    return { prompt: `${a}/${d} × ${b}/${d2}`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
  }
  const simp = simplifyFraction(a * d2, d * b);
  return { prompt: `${a}/${d} ÷ ${b}/${d2}`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
}

/** @type {FamilyBuilder} */
function frac_percentOfNumber(difficulty) {
  const pct = difficulty === "easy" ? pick([10, 20, 25, 50]) : difficulty === "medium" ? pick([15, 30, 40, 75]) : pick([12, 35, 45, 80]);
  const base = difficulty === "easy"
    ? pick([20, 40, 50, 80, 100, 200])
    : difficulty === "medium"
      ? pick([60, 90, 120, 150, 240])
      : pick([80, 125, 160, 200, 320]);
  const ans = (pct / 100) * base;
  // For PvP, keep integer outputs
  if (Number.isInteger(ans)) {
    return { prompt: `${pct}% of ${base}`, answer: String(ans), answerType: "int" };
  }
  const rounded = Math.round(ans * 10) / 10;
  return { prompt: `${pct}% of ${base}`, answer: String(rounded), answerType: "number" };
}

// -------------------- Ratios / Proportions --------------------

/** @type {FamilyBuilder} */
function ratio_simplifyComplete(difficulty) {
  if (difficulty === "easy") {
    const a = randomInt(2, 12);
    const b = randomInt(2, 12);
    const g = gcd(a, b);
    return { prompt: `Simplify ratio ${a}:${b}`, answer: `${a / g}:${b / g}`, answerType: "text" };
  }
  if (difficulty === "medium") {
    const x = randomInt(2, 12);
    const y = randomInt(2, 12);
    const k = randomInt(2, 8);
    return { prompt: `Complete: ${x}:${y} = ${x * k}:?`, answer: String(y * k), answerType: "int" };
  }
  // hard: scale factor / proportion
  const a = randomInt(2, 9);
  const b = randomInt(2, 9);
  const c = a * randomInt(3, 9);
  const d = b * randomInt(3, 9);
  // a/b = c/x => x = (b*c)/a
  const x = (b * c) / a;
  return { prompt: `Solve: ${a}/${b} = ${c}/x`, answer: String(x), answerType: "int" };
}

/** @type {FamilyBuilder} */
function ratio_unitRate(difficulty) {
  const cost = randomInt(difficulty === "easy" ? 2 : 5, difficulty === "easy" ? 20 : difficulty === "medium" ? 45 : 80);
  const qty = randomInt(2, difficulty === "easy" ? 10 : difficulty === "medium" ? 12 : 16);
  const total = cost * qty;
  if (difficulty === "easy") {
    return { prompt: `${total} for ${qty} items. cost per item?`, answer: String(cost), answerType: "int" };
  }
  if (difficulty === "medium") {
    const scale = randomInt(2, 6);
    return { prompt: `${total} for ${qty} items. cost for ${qty * scale}?`, answer: String(total * scale), answerType: "int" };
  }
  const scale = randomInt(2, 8);
  return { prompt: `Scale factor ${scale}: length ${qty} → ?`, answer: String(qty * scale), answerType: "int" };
}

/** @type {FamilyBuilder} */
function ratio_table(difficulty) {
  const x = randomInt(2, 10);
  const y = randomInt(2, 12);
  const k = randomInt(2, difficulty === "easy" ? 6 : difficulty === "medium" ? 8 : 10);
  if (difficulty === "easy") {
    return { prompt: `If ${x}:${y}, then ${x * k}:?`, answer: String(y * k), answerType: "int" };
  }
  if (difficulty === "medium") {
    return { prompt: `If ${x}:${y}, then ?:${y * k}`, answer: String(x * k), answerType: "int" };
  }
  // hard: missing k
  return { prompt: `If ${x}:${y} = ${x * k}:${y * k}, k=?`, answer: String(k), answerType: "int" };
}

// -------------------- Exponents / Roots --------------------

/** @type {FamilyBuilder} */
function exp_basicSquaresRoots(difficulty) {
  if (difficulty === "easy") {
    const t = pick(["square", "cube", "sqrt"]);
    if (t === "square") {
      const a = randomInt(2, 15);
      return { prompt: `${a}²`, answer: String(a * a), answerType: "int" };
    }
    if (t === "cube") {
      const a = randomInt(2, 9);
      return { prompt: `${a}³`, answer: String(a ** 3), answerType: "int" };
    }
    const a = randomInt(3, 20);
    return { prompt: `√${a * a}`, answer: String(a), answerType: "int" };
  }
  if (difficulty === "medium") {
    // exponent laws (keep answers short; don't explode into huge integers)
    const a = randomInt(2, 9);
    const m = randomInt(2, 6);
    const n = randomInt(2, 6);
    return { prompt: `Simplify: ${a}^${m} × ${a}^${n}`, answer: `${a}^${m + n}`, answerType: "text" };
  }
  // hard: mixed exponent expression simplified
  const a = randomInt(2, 8);
  const m = randomInt(3, 6);
  const n = randomInt(1, m - 1);
  // a^m / a^n = a^(m-n)
  return { prompt: `Simplify: ${a}^${m} ÷ ${a}^${n}`, answer: `${a}^${m - n}`, answerType: "text" };
}

/** @type {FamilyBuilder} */
function exp_scientificNotation(difficulty) {
  if (difficulty === "easy") {
    const a = pick([10, 100, 1000]);
    const b = randomInt(2, 9);
    return { prompt: `${b} × ${a}`, answer: String(b * a), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(2, 9);
    const b = randomInt(1, 3);
    const c = randomInt(2, 9);
    const d = randomInt(1, 3);
    // (a×10^b) × (c×10^d) = (a*c)×10^(b+d)
    return { prompt: `(${a}×10^${b})(${c}×10^${d})`, answer: String((a * c) * 10 ** (b + d)), answerType: "int" };
  }
  // hard: normalize scientific notation (still concise)
  const a = randomInt(12, 95);
  const b = randomInt(2, 5);
  const value = a * 10 ** b;
  // represent as (a/10)×10^(b+1) => first digit non-zero 1..9
  const mantissa = a / 10;
  return { prompt: `${value} in sci (a×10^n), a=?`, answer: String(mantissa), answerType: "number" };
}

/** @type {FamilyBuilder} */
function exp_rootsSimplify(difficulty) {
  if (difficulty === "easy") {
    const a = pick([4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144]);
    const r = Math.sqrt(a);
    return { prompt: `√${a}`, answer: String(r), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(2, 12);
    return { prompt: `√(${a}²)`, answer: String(a), answerType: "int" };
  }
  // hard: cube roots of perfect cubes
  const a = randomInt(2, 9);
  return { prompt: `∛${a ** 3}`, answer: String(a), answerType: "int" };
}

// -------------------- Data / Statistics --------------------

/** @type {FamilyBuilder} */
function stats_modeRangeProb(difficulty) {
  if (difficulty === "easy") {
    const type = pick(["mode", "range", "prob"]);
    if (type === "mode") {
      const base = [2, 3, 4, 5, 6];
      const mode = pick(base);
      const arr = [pick(base), mode, pick(base), mode, mode];
      return { prompt: `Mode of [${arr.join(",")}]`, answer: String(mode), answerType: "int" };
    }
    if (type === "range") {
      const a = randomInt(1, 9);
      const b = randomInt(10, 25);
      const c = randomInt(2, 15);
      const arr = [a, b, c, randomInt(1, 25), randomInt(1, 25)];
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      return { prompt: `Range of [${arr.join(",")}]`, answer: String(max - min), answerType: "int" };
    }
    // simple probability (fair)
    const red = randomInt(1, 5);
    const blue = randomInt(1, 5);
    const total = red + blue;
    const simp = simplifyFraction(red, total);
    return { prompt: `Bag: ${red}R ${blue}B. P(R)?`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
  }
  if (difficulty === "medium") {
    const arr = Array.from({ length: 5 }, () => randomInt(1, 12));
    const sum = arr.reduce((s, v) => s + v, 0);
    const mean = sum / arr.length;
    const sorted = [...arr].sort((a, b) => a - b);
    const median = sorted[2];
    if (Math.random() < 0.5) return { prompt: `Mean of [${arr.join(",")}]`, answer: String(mean), answerType: "number" };
    return { prompt: `Median of [${arr.join(",")}]`, answer: String(median), answerType: "int" };
  }
  // hard: mean with missing value (short)
  // Generate with bounds so x stays non-negative and not huge.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const a = randomInt(2, 10);
    const b = randomInt(2, 10);
    const c = randomInt(2, 10);
    const d = randomInt(2, 10);
    const mean = randomInt(4, 12);
    const x = mean * 5 - (a + b + c + d);
    if (x >= 0 && x <= 25) {
      return { prompt: `Mean of [${a},${b},${c},${d},x] is ${mean}. x=?`, answer: String(x), answerType: "int" };
    }
  }
  // fallback
  const a = 4, b = 6, c = 8, d = 2, mean = 6;
  const x = mean * 5 - (a + b + c + d);
  return { prompt: `Mean of [${a},${b},${c},${d},x] is ${mean}. x=?`, answer: String(x), answerType: "int" };
}

/** @type {FamilyBuilder} */
function stats_probability(difficulty) {
  const total = difficulty === "easy" ? 6 : difficulty === "medium" ? 8 : 10;
  const favorable = randomInt(1, total - 1);
  const simp = simplifyFraction(favorable, total);
  if (difficulty === "easy") return { prompt: `P(event) = ${favorable}/${total} simplify`, answer: formatFraction(simp.n, simp.d), answerType: "fraction" };
  if (difficulty === "medium") return { prompt: `P(not event) if P(event)=${favorable}/${total}`, answer: formatFraction(total - favorable, total), answerType: "fraction" };
  // hard: complement + simplify (still concise, always <= 1)
  const comp = simplifyFraction(total - favorable, total);
  return { prompt: `If P(event)=${favorable}/${total}, P(not event)=? (simplify)`, answer: formatFraction(comp.n, comp.d), answerType: "fraction" };
}

/** @type {FamilyBuilder} */
function stats_twoStep(difficulty) {
  if (difficulty === "easy") {
    const arr = [randomInt(1, 9), randomInt(1, 9), randomInt(1, 9), randomInt(1, 9)];
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return { prompt: `Max - min for [${arr.join(",")}]`, answer: String(max - min), answerType: "int" };
  }
  if (difficulty === "medium") {
    const arr = Array.from({ length: 6 }, () => randomInt(1, 15));
    const sorted = [...arr].sort((a, b) => a - b);
    const median = (sorted[2] + sorted[3]) / 2;
    return { prompt: `Median of [${arr.join(",")}]`, answer: String(median), answerType: "number" };
  }
  // hard: range after adding a value
  const arr = Array.from({ length: 5 }, () => randomInt(1, 20));
  const add = randomInt(1, 20);
  const min = Math.min(...arr, add);
  const max = Math.max(...arr, add);
  return { prompt: `Range of [${arr.join(",")},${add}]`, answer: String(max - min), answerType: "int" };
}

// -------------------- Trigonometry --------------------

/** @type {FamilyBuilder} */
function trig_vocab(difficulty) {
  // Keep it very short and answer as a single word.
  if (difficulty === "easy") {
    const qn = pick([
      { p: "Longest side in right triangle?", a: "hypotenuse" },
      { p: "sin = opp / ?", a: "hypotenuse" },
      { p: "cos = adj / ?", a: "hypotenuse" },
      { p: "tan = opp / ?", a: "adjacent" },
    ]);
    return { prompt: qn.p, answer: qn.a, answerType: "text" };
  }
  if (difficulty === "medium") {
    // use tan ratio to avoid surds
    const opp = pick([3, 6, 9, 12]);
    const adj = pick([4, 8, 16, 20]);
    const k = pick([1, 2]);
    const O = opp * k;
    const A = adj * k;
    return { prompt: `tan θ = opp/adj. if adj=${A}, opp=? (tan=${opp}/${adj})`, answer: String(O), answerType: "int" };
  }
  // hard: special angles only (clean)
  const qn = pick([
    { p: "sin θ = 1/2, θ=?", a: "30" },
    { p: "cos θ = 1/2, θ=?", a: "60" },
    { p: "tan θ = 1, θ=?", a: "45" },
  ]);
  return { prompt: qn.p, answer: qn.a, answerType: "angle" };
}

/** @type {FamilyBuilder} */
function trig_sohcahtoa(difficulty) {
  if (difficulty === "easy") {
    const qn = pick([
      { p: "SOH: sin = ?", a: "opp/hyp" },
      { p: "CAH: cos = ?", a: "adj/hyp" },
      { p: "TOA: tan = ?", a: "opp/adj" },
    ]);
    return { prompt: qn.p, answer: qn.a, answerType: "text" };
  }
  if (difficulty === "medium") {
    // 3-4-5 family
    const k = pick([1, 2, 3]);
    const opp = 3 * k;
    const adj = 4 * k;
    const hyp = 5 * k;
    const which = pick(["sin", "cos", "tan"]);
    if (which === "sin") return { prompt: `Right tri: opp=${opp}, hyp=${hyp}. sinθ=?`, answer: formatFraction(opp, hyp), answerType: "fraction" };
    if (which === "cos") return { prompt: `Right tri: adj=${adj}, hyp=${hyp}. cosθ=?`, answer: formatFraction(adj, hyp), answerType: "fraction" };
    return { prompt: `Right tri: opp=${opp}, adj=${adj}. tanθ=?`, answer: formatFraction(opp, adj), answerType: "fraction" };
  }
  // hard: find missing side using tan ratio (still clean)
  const ratio = pick([
    { num: 3, den: 4 },
    { num: 5, den: 12 },
    { num: 8, den: 15 },
  ]);
  // Choose adjacent as a multiple of denominator so the result is an integer.
  const adj = ratio.den * pick([1, 2, 3, 4]);
  const opp = (adj * ratio.num) / ratio.den;
  return { prompt: `tanθ=${ratio.num}/${ratio.den}. adj=${adj}. opp=?`, answer: String(opp), answerType: "int" };
}

/** @type {FamilyBuilder} */
function trig_angleFromRatio(difficulty) {
  if (difficulty === "easy") {
    const qn = pick([
      { p: "Opposite side is ... the angle", a: "across" },
      { p: "Adjacent side is ... the angle", a: "nextto" },
    ]);
    return { prompt: qn.p, answer: qn.a, answerType: "text" };
  }
  if (difficulty === "medium") {
    const qn = pick([
      { p: "tan 45° = ?", a: "1" },
      { p: "sin 30° = ?", a: "1/2" },
      { p: "cos 60° = ?", a: "1/2" },
    ]);
    return { prompt: qn.p, answer: qn.a, answerType: qn.a.includes("/") ? "fraction" : "int" };
  }
  // hard: inverse with known value
  const qn = pick([
    { p: "θ if tanθ=1", a: "45" },
    { p: "θ if sinθ=1/2", a: "30" },
    { p: "θ if cosθ=1/2", a: "60" },
  ]);
  return { prompt: qn.p, answer: qn.a, answerType: "angle" };
}

// -------------------- Functions / Graphs --------------------

/** @type {FamilyBuilder} */
function fn_evaluate(difficulty) {
  if (difficulty === "easy") {
    const a = randomInt(1, 6);
    const b = randomInt(0, 12);
    const x = randomInt(0, 10);
    return { prompt: `f(x)=${a}x+${b}. f(${x})?`, answer: String(a * x + b), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(1, 6);
    const b = randomInt(-10, 10);
    const x = randomInt(-5, 8);
    const bText = b >= 0 ? `+${b}` : `${b}`;
    return { prompt: `f(x)=${a}x${bText}. f(${x})?`, answer: String(a * x + b), answerType: "int" };
  }
  // hard: composition
  const a = randomInt(1, 4);
  const b = randomInt(0, 6);
  const c = randomInt(1, 4);
  const x = randomInt(0, 8);
  // f(x)=ax+b, g(x)=cx. find f(g(x))
  const gx = c * x;
  return { prompt: `f(x)=${a}x+${b}, g(x)=${c}x. f(g(${x}))?`, answer: String(a * gx + b), answerType: "int" };
}

/** @type {FamilyBuilder} */
function fn_slopeLine(difficulty) {
  if (difficulty === "easy") {
    const x = randomInt(-5, 5);
    const y = randomInt(-5, 5);
    return { prompt: `Point: (${x}, ${y}). y=?`, answer: String(y), answerType: "int" };
  }
  if (difficulty === "medium") {
    const x1 = randomInt(-4, 2);
    const y1 = randomInt(-4, 4);
    const dx = pick([1, 2, 3, 4]);
    const m = pick([-3, -2, -1, 1, 2, 3]);
    const x2 = x1 + dx;
    const y2 = y1 + m * dx;
    return { prompt: `Slope between (${x1},${y1}) and (${x2},${y2})`, answer: String(m), answerType: "int" };
  }
  // hard: line equation y = mx + b from a point and slope
  const m = pick([-3, -2, -1, 1, 2, 3]);
  const x = randomInt(-4, 4);
  const y = randomInt(-8, 8);
  const b = y - m * x;
  const bText = b >= 0 ? `+${b}` : `${b}`;
  return { prompt: `Line with slope ${m} through (${x},${y}): y= ?`, answer: `${m}x${bText}`, answerType: "text" };
}

/** @type {FamilyBuilder} */
function fn_solveForX(difficulty) {
  if (difficulty === "easy") {
    const x = randomInt(0, 10);
    const a = randomInt(2, 6);
    const b = randomInt(0, 12);
    const y = a * x + b;
    return { prompt: `If y=${a}x+${b} and y=${y}, x=?`, answer: String(x), answerType: "int" };
  }
  if (difficulty === "medium") {
    const x = randomInt(-6, 10);
    const a = randomInt(2, 7);
    const b = randomInt(-10, 10);
    const y = a * x + b;
    const bText = b >= 0 ? `+${b}` : `${b}`;
    return { prompt: `If y=${a}x${bText} and y=${y}, x=?`, answer: String(x), answerType: "int" };
  }
  // hard: two-step from two points (find m)
  const x1 = randomInt(-3, 3);
  const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
  const b = randomInt(-6, 6);
  const x2 = x1 + pick([1, 2, 3]);
  const y1 = m * x1 + b;
  const y2 = m * x2 + b;
  return { prompt: `Line through (${x1},${y1}) and (${x2},${y2}). slope?`, answer: String(m), answerType: "int" };
}

// -------------------- Calculus Basics --------------------

/** @type {FamilyBuilder} */
function calc_derivativeBasics(difficulty) {
  if (difficulty === "easy") {
    const qn = pick([
      { p: "d/dx(x²)", a: "2x" },
      { p: "d/dx(x³)", a: "3x^2" },
      { p: "d/dx(7)", a: "0" },
    ]);
    return { prompt: qn.p, answer: qn.a, answerType: qn.a === "0" ? "int" : "text" };
  }
  if (difficulty === "medium") {
    const a = randomInt(2, 7);
    const b = randomInt(0, 8);
    const c = randomInt(2, 6);
    // f(x)=ax^c + b
    return { prompt: `f(x)=${a}x^${c}+${b}. f'(x)?`, answer: `${a * c}x^${c - 1}`, answerType: "text" };
  }
  // hard: evaluate derivative at a point
  const a = randomInt(2, 6);
  const c = randomInt(2, 5);
  const x = randomInt(1, 5);
  const derivAt = a * c * x ** (c - 1);
  return { prompt: `f(x)=${a}x^${c}. f'(${x})?`, answer: String(derivAt), answerType: "int" };
}

/** @type {FamilyBuilder} */
function calc_polyDerivative(difficulty) {
  if (difficulty === "easy") {
    const a = randomInt(2, 8);
    return { prompt: `d/dx(${a}x)`, answer: String(a), answerType: "int" };
  }
  if (difficulty === "medium") {
    const a = randomInt(2, 6);
    const b = randomInt(2, 6);
    return { prompt: `d/dx(${a}x^2 + ${b}x)`, answer: `${2 * a}x+${b}`, answerType: "text" };
  }
  // hard: tangent slope at x (derivative evaluation)
  const a = randomInt(2, 5);
  const b = randomInt(2, 7);
  const x = randomInt(1, 4);
  const slope = 2 * a * x + b;
  return { prompt: `Slope of y=${a}x^2+${b}x at x=${x}`, answer: String(slope), answerType: "int" };
}

/** @type {FamilyBuilder} */
function calc_integrationBasics(difficulty) {
  if (difficulty === "easy") {
    // avoid +C, use definite integral
    const a = randomInt(1, 5);
    const upper = pick([1, 2, 3]);
    const num = a * (upper ** 2);
    const out = simplifyFraction(num, 2);
    return { prompt: `∫₀^${upper} ${a}x dx`, answer: formatFraction(out.n, out.d), answerType: out.d === 1 ? "int" : "fraction" };
  }
  if (difficulty === "medium") {
    const upper = pick([1, 2, 3]);
    // Choose a multiple of 3 to avoid ugly thirds
    const a = pick([3, 6, 9, 12]);
    const num = a * (upper ** 3);
    const out = simplifyFraction(num, 3);
    return { prompt: `∫₀^${upper} ${a}x^2 dx`, answer: formatFraction(out.n, out.d), answerType: out.d === 1 ? "int" : "fraction" };
  }
  // hard: simple polynomial definite integral
  const upper = pick([1, 2, 3]);
  const a = pick([3, 6, 9, 12]); // divisible by 3
  const b = pick([2, 4, 6, 8, 10]); // divisible by 2
  // a*u^3/3 + b*u^2/2 => common denom 6
  const num = (2 * a * (upper ** 3)) + (3 * b * (upper ** 2));
  const out = simplifyFraction(num, 6);
  return {
    prompt: `∫₀^${upper} (${a}x^2 + ${b}x) dx`,
    answer: formatFraction(out.n, out.d),
    answerType: out.d === 1 ? "int" : "fraction"
  };
}

// ---------------------------------------------------------------------------
// BANK registry
// ---------------------------------------------------------------------------

/**
 * Each topic maps to per-difficulty weighted family builders.
 * Add new families by adding entries here; IDs must be stable.
 */
const BANK = {
  arithmetic: {
    easy: [
      { id: "arith-one-step", weight: 4, build: arith_oneStep },
      { id: "arith-bodmas", weight: 3, build: arith_bodmas },
      { id: "arith-decimals", weight: 2, build: arith_decimalFractionMix },
    ],
    medium: [
      { id: "arith-one-step", weight: 3, build: arith_oneStep },
      { id: "arith-bodmas", weight: 4, build: arith_bodmas },
      { id: "arith-mix", weight: 3, build: arith_decimalFractionMix },
    ],
    hard: [
      { id: "arith-one-step", weight: 2, build: arith_oneStep },
      { id: "arith-bodmas", weight: 5, build: arith_bodmas },
      { id: "arith-mix", weight: 3, build: arith_decimalFractionMix },
    ],
  },
  algebra: {
    easy: [
      { id: "alg-solve", weight: 4, build: alg_solveOneStep },
      { id: "alg-substitute", weight: 3, build: alg_substitute },
      { id: "alg-simplify", weight: 2, build: alg_simplifyLikeTerms },
    ],
    medium: [
      { id: "alg-solve", weight: 4, build: alg_solveOneStep },
      { id: "alg-simplify", weight: 3, build: alg_simplifyLikeTerms },
      { id: "alg-substitute", weight: 3, build: alg_substitute },
    ],
    hard: [
      { id: "alg-solve", weight: 5, build: alg_solveOneStep },
      { id: "alg-substitute", weight: 3, build: alg_substitute },
      { id: "alg-simplify", weight: 2, build: alg_simplifyLikeTerms },
    ],
  },
  geometry: {
    easy: [
      { id: "geo-area-perim", weight: 4, build: geo_areaPerimeter },
      { id: "geo-angles", weight: 3, build: geo_angles },
      { id: "geo-pyth-vol", weight: 2, build: geo_pythagorasVolume },
    ],
    medium: [
      { id: "geo-area-perim", weight: 3, build: geo_areaPerimeter },
      { id: "geo-angles", weight: 4, build: geo_angles },
      { id: "geo-pyth-vol", weight: 3, build: geo_pythagorasVolume },
    ],
    hard: [
      { id: "geo-angles", weight: 3, build: geo_angles },
      { id: "geo-pyth-vol", weight: 5, build: geo_pythagorasVolume },
      { id: "geo-area-perim", weight: 2, build: geo_areaPerimeter },
    ],
  },
  fractions: {
    easy: [
      { id: "frac-simplify-convert", weight: 3, build: frac_simplifyConvertPercent },
      { id: "frac-ops", weight: 4, build: frac_operations },
      { id: "frac-percent-of", weight: 3, build: frac_percentOfNumber },
    ],
    medium: [
      { id: "frac-ops", weight: 4, build: frac_operations },
      { id: "frac-simplify-convert", weight: 3, build: frac_simplifyConvertPercent },
      { id: "frac-percent-of", weight: 3, build: frac_percentOfNumber },
    ],
    hard: [
      { id: "frac-ops", weight: 5, build: frac_operations },
      { id: "frac-simplify-convert", weight: 3, build: frac_simplifyConvertPercent },
      { id: "frac-percent-of", weight: 2, build: frac_percentOfNumber },
    ],
  },
  ratios: {
    easy: [
      { id: "ratio-simplify", weight: 4, build: ratio_simplifyComplete },
      { id: "ratio-table", weight: 3, build: ratio_table },
      { id: "ratio-unit", weight: 3, build: ratio_unitRate },
    ],
    medium: [
      { id: "ratio-table", weight: 4, build: ratio_table },
      { id: "ratio-unit", weight: 3, build: ratio_unitRate },
      { id: "ratio-simplify", weight: 3, build: ratio_simplifyComplete },
    ],
    hard: [
      { id: "ratio-simplify", weight: 4, build: ratio_simplifyComplete },
      { id: "ratio-unit", weight: 3, build: ratio_unitRate },
      { id: "ratio-table", weight: 3, build: ratio_table },
    ],
  },
  exponents: {
    easy: [
      { id: "exp-basic", weight: 4, build: exp_basicSquaresRoots },
      { id: "exp-roots", weight: 3, build: exp_rootsSimplify },
      { id: "exp-sci", weight: 2, build: exp_scientificNotation },
    ],
    medium: [
      { id: "exp-basic", weight: 4, build: exp_basicSquaresRoots },
      { id: "exp-roots", weight: 3, build: exp_rootsSimplify },
      { id: "exp-sci", weight: 3, build: exp_scientificNotation },
    ],
    hard: [
      { id: "exp-basic", weight: 4, build: exp_basicSquaresRoots },
      { id: "exp-sci", weight: 3, build: exp_scientificNotation },
      { id: "exp-roots", weight: 3, build: exp_rootsSimplify },
    ],
  },
  statistics: {
    easy: [
      { id: "stats-core", weight: 5, build: stats_modeRangeProb },
      { id: "stats-prob", weight: 2, build: stats_probability },
      { id: "stats-two-step", weight: 3, build: stats_twoStep },
    ],
    medium: [
      { id: "stats-core", weight: 4, build: stats_modeRangeProb },
      { id: "stats-two-step", weight: 3, build: stats_twoStep },
      { id: "stats-prob", weight: 3, build: stats_probability },
    ],
    hard: [
      { id: "stats-core", weight: 4, build: stats_modeRangeProb },
      { id: "stats-two-step", weight: 4, build: stats_twoStep },
      { id: "stats-prob", weight: 2, build: stats_probability },
    ],
  },
  trigonometry: {
    easy: [
      { id: "trig-vocab", weight: 4, build: trig_vocab },
      { id: "trig-sohcahtoa", weight: 3, build: trig_sohcahtoa },
      { id: "trig-angle", weight: 2, build: trig_angleFromRatio },
    ],
    medium: [
      { id: "trig-sohcahtoa", weight: 4, build: trig_sohcahtoa },
      { id: "trig-vocab", weight: 3, build: trig_vocab },
      { id: "trig-angle", weight: 3, build: trig_angleFromRatio },
    ],
    hard: [
      { id: "trig-angle", weight: 4, build: trig_angleFromRatio },
      { id: "trig-sohcahtoa", weight: 4, build: trig_sohcahtoa },
      { id: "trig-vocab", weight: 2, build: trig_vocab },
    ],
  },
  functions: {
    easy: [
      { id: "fn-eval", weight: 5, build: fn_evaluate },
      { id: "fn-point", weight: 2, build: fn_slopeLine },
      { id: "fn-solve", weight: 3, build: fn_solveForX },
    ],
    medium: [
      { id: "fn-eval", weight: 4, build: fn_evaluate },
      { id: "fn-slope", weight: 3, build: fn_slopeLine },
      { id: "fn-solve", weight: 3, build: fn_solveForX },
    ],
    hard: [
      { id: "fn-slope", weight: 4, build: fn_slopeLine },
      { id: "fn-eval", weight: 3, build: fn_evaluate },
      { id: "fn-solve", weight: 3, build: fn_solveForX },
    ],
  },
  calculus: {
    easy: [
      { id: "calc-deriv-basic", weight: 5, build: calc_derivativeBasics },
      { id: "calc-poly", weight: 3, build: calc_polyDerivative },
      { id: "calc-int", weight: 2, build: calc_integrationBasics },
    ],
    medium: [
      { id: "calc-deriv-basic", weight: 4, build: calc_derivativeBasics },
      { id: "calc-poly", weight: 3, build: calc_polyDerivative },
      { id: "calc-int", weight: 3, build: calc_integrationBasics },
    ],
    hard: [
      { id: "calc-poly", weight: 4, build: calc_polyDerivative },
      { id: "calc-deriv-basic", weight: 3, build: calc_derivativeBasics },
      { id: "calc-int", weight: 3, build: calc_integrationBasics },
    ],
  },
};

/**
 * @param {string} topic
 * @param {string} difficulty
 * @param {string=} scopeKey
 * @returns {GeneratedQuestion}
 */
function generateQuestion(topic, difficulty, scopeKey = "global") {
  /** @type {Topic} */
  const safeTopic = isValidTopic(topic) ? topic : "arithmetic";
  /** @type {Difficulty} */
  const safeDifficulty = isValidDifficulty(difficulty) ? difficulty : "easy";

  const topicBank = BANK[safeTopic];
  const families = topicBank?.[safeDifficulty] ?? BANK.arithmetic.easy;
  const family = pickFamily(families, scopeKey, safeTopic, safeDifficulty);
  const built = family.build(safeDifficulty);

  // Safeguards: prevent empty answers/prompts.
  const prompt = String(built.prompt ?? "").trim();
  const answer = String(built.answer ?? "").trim();
  if (!prompt || !answer) {
    // fallback to simple arithmetic
    const a = randomInt(2, 20);
    const b = randomInt(2, 20);
    return {
      prompt: `${a} + ${b}`,
      answer: String(a + b),
      topic: "arithmetic",
      difficulty: safeDifficulty,
      familyId: "fallback:add",
      answerType: "int",
    };
  }

  return q(safeTopic, safeDifficulty, family.id, built);
}

module.exports = {
  TOPICS,
  DIFFICULTIES,
  generateQuestion,
  normalizeAnswer,
  isCorrectAnswer,
  isValidTopic,
  isValidDifficulty,
};

