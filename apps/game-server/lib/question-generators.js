const TOPICS = [
  "arithmetic",
  "mental-math",
  "algebra",
  "percentages",
  "fractions",
  "powers",
  "mixed"
];

const DIFFICULTIES = ["easy", "medium", "hard"];

const RECENT_PATTERN_BY_SCOPE = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const next = y;
    y = x % y;
    x = next;
  }

  return x || 1;
}

function simplifyFraction(numerator, denominator) {
  const factor = gcd(numerator, denominator);
  return {
    numerator: numerator / factor,
    denominator: denominator / factor
  };
}

function formatFraction(numerator, denominator) {
  if (denominator === 1) {
    return String(numerator);
  }

  return `${numerator}/${denominator}`;
}

function buildNoRepeatKey(scopeKey, topic, difficulty) {
  return `${scopeKey ?? "global"}:${topic}:${difficulty}`;
}

function pickPattern(patterns, scopeKey, topic, difficulty) {
  if (patterns.length === 1) {
    return patterns[0];
  }

  const key = buildNoRepeatKey(scopeKey, topic, difficulty);
  const previousPatternId = RECENT_PATTERN_BY_SCOPE.get(key);
  const candidates = patterns.filter((pattern) => pattern.id !== previousPatternId);
  const chosen = pick(candidates.length > 0 ? candidates : patterns);
  RECENT_PATTERN_BY_SCOPE.set(key, chosen.id);
  return chosen;
}

function patternArithmeticAdd(difficulty) {
  const max = difficulty === "easy" ? 15 : difficulty === "medium" ? 60 : 180;
  const a = randomInt(2, max);
  const b = randomInt(2, max);
  return { prompt: `${a} + ${b}`, answer: String(a + b) };
}

function patternArithmeticSubtract(difficulty) {
  const max = difficulty === "easy" ? 20 : difficulty === "medium" ? 90 : 240;
  const a = randomInt(8, max);
  const b = randomInt(1, difficulty === "easy" ? a : Math.floor(a * 0.8));
  return { prompt: `${a} - ${b}`, answer: String(a - b) };
}

function patternArithmeticMultiply(difficulty) {
  const min = difficulty === "easy" ? 2 : difficulty === "medium" ? 6 : 12;
  const max = difficulty === "easy" ? 12 : difficulty === "medium" ? 16 : 24;
  const a = randomInt(min, max);
  const b = randomInt(min, max);
  return { prompt: `${a} x ${b}`, answer: String(a * b) };
}

function patternArithmeticDivide(difficulty) {
  const divisor = difficulty === "easy" ? randomInt(2, 10) : difficulty === "medium" ? randomInt(3, 14) : randomInt(4, 18);
  const quotient = difficulty === "easy" ? randomInt(2, 14) : difficulty === "medium" ? randomInt(4, 18) : randomInt(7, 22);
  const dividend = divisor * quotient;
  return { prompt: `${dividend} / ${divisor}`, answer: String(quotient) };
}

function patternArithmeticMixed(difficulty) {
  const a = difficulty === "easy" ? randomInt(2, 12) : difficulty === "medium" ? randomInt(8, 24) : randomInt(12, 36);
  const b = difficulty === "easy" ? randomInt(2, 6) : difficulty === "medium" ? randomInt(3, 9) : randomInt(4, 12);
  const c = difficulty === "easy" ? randomInt(2, 6) : difficulty === "medium" ? randomInt(3, 9) : randomInt(4, 12);
  return { prompt: `${a} + ${b} x ${c}`, answer: String(a + b * c) };
}

function patternArithmeticMissingAdd(difficulty) {
  const missing = difficulty === "easy" ? randomInt(2, 14) : difficulty === "medium" ? randomInt(6, 40) : randomInt(12, 90);
  const b = difficulty === "easy" ? randomInt(2, 14) : difficulty === "medium" ? randomInt(8, 40) : randomInt(10, 90);
  const c = missing + b;
  return { prompt: `? + ${b} = ${c}`, answer: String(missing) };
}

function patternArithmeticMissingSubtract(difficulty) {
  const a = difficulty === "easy" ? randomInt(12, 30) : difficulty === "medium" ? randomInt(30, 100) : randomInt(80, 220);
  const c = difficulty === "easy" ? randomInt(2, 12) : difficulty === "medium" ? randomInt(8, 40) : randomInt(20, 100);
  const missing = a - c;
  return { prompt: `${a} - ? = ${c}`, answer: String(missing) };
}

function patternMentalMultiply25() {
  const multiplier = pick([2, 4, 6, 8]);
  return { prompt: `25 x ${multiplier}`, answer: String(25 * multiplier) };
}

function patternMentalMultiply50(difficulty) {
  const multiplier = difficulty === "easy" ? pick([2, 3, 4, 6]) : difficulty === "medium" ? pick([5, 6, 7, 8]) : pick([8, 9, 11, 12]);
  return { prompt: `50 x ${multiplier}`, answer: String(50 * multiplier) };
}

function patternMentalNearHundredAdd(difficulty) {
  const base = difficulty === "easy" ? pick([99, 98]) : difficulty === "medium" ? pick([99, 97, 96]) : pick([199, 149, 99]);
  const addend = difficulty === "easy" ? randomInt(12, 39) : difficulty === "medium" ? randomInt(20, 65) : randomInt(40, 95);
  return { prompt: `${base} + ${addend}`, answer: String(base + addend) };
}

function patternMentalNearHundredSubtract(difficulty) {
  const base = difficulty === "easy" ? 100 : difficulty === "medium" ? pick([100, 200]) : pick([300, 400, 500]);
  const sub = difficulty === "easy" ? randomInt(21, 58) : difficulty === "medium" ? randomInt(37, 94) : randomInt(75, 180);
  return { prompt: `${base} - ${sub}`, answer: String(base - sub) };
}

function patternMentalDouble(difficulty) {
  const value = difficulty === "easy" ? randomInt(12, 40) : difficulty === "medium" ? randomInt(24, 90) : randomInt(60, 180);
  return { prompt: `double ${value}`, answer: String(value * 2) };
}

function patternMentalHalf(difficulty) {
  const half = difficulty === "easy" ? randomInt(12, 60) : difficulty === "medium" ? randomInt(30, 120) : randomInt(80, 220);
  const value = half * 2;
  return { prompt: `half of ${value}`, answer: String(half) };
}

function patternAlgebraAdd(difficulty) {
  const x = difficulty === "easy" ? randomInt(2, 14) : difficulty === "medium" ? randomInt(3, 20) : randomInt(6, 30);
  const a = difficulty === "easy" ? randomInt(1, 9) : difficulty === "medium" ? randomInt(3, 12) : randomInt(6, 18);
  return { prompt: `x + ${a} = ${x + a}`, answer: String(x) };
}

function patternAlgebraMultiply(difficulty) {
  const x = difficulty === "easy" ? randomInt(2, 12) : difficulty === "medium" ? randomInt(3, 18) : randomInt(4, 28);
  const a = difficulty === "easy" ? randomInt(2, 5) : difficulty === "medium" ? randomInt(3, 8) : randomInt(5, 10);
  return { prompt: `${a}x = ${a * x}`, answer: String(x) };
}

function patternAlgebraLinear(difficulty) {
  const x = difficulty === "easy" ? randomInt(2, 10) : difficulty === "medium" ? randomInt(4, 16) : randomInt(6, 22);
  const a = difficulty === "easy" ? randomInt(2, 4) : difficulty === "medium" ? randomInt(2, 7) : randomInt(4, 9);
  const b = difficulty === "easy" ? randomInt(1, 8) : difficulty === "medium" ? randomInt(3, 12) : randomInt(6, 20);
  return { prompt: `${a}x + ${b} = ${a * x + b}`, answer: String(x) };
}

function patternAlgebraBracket(difficulty) {
  const x = difficulty === "easy" ? randomInt(2, 9) : difficulty === "medium" ? randomInt(3, 14) : randomInt(5, 20);
  const a = difficulty === "easy" ? randomInt(2, 4) : difficulty === "medium" ? randomInt(2, 6) : randomInt(3, 8);
  const b = difficulty === "easy" ? randomInt(1, 5) : difficulty === "medium" ? randomInt(2, 7) : randomInt(3, 10);
  return { prompt: `${a}(x + ${b}) = ${a * (x + b)}`, answer: String(x) };
}

function patternPercentOf(difficulty) {
  const percent = difficulty === "easy" ? pick([10, 20, 25, 50]) : difficulty === "medium" ? pick([15, 30, 40, 75]) : pick([12, 35, 45, 80]);
  const base = difficulty === "easy" ? pick([20, 40, 50, 80, 100, 200]) : difficulty === "medium" ? pick([60, 90, 120, 150, 240]) : pick([80, 125, 160, 200, 320]);
  const answer = Math.round((percent / 100) * base);
  return { prompt: `${percent}% of ${base}`, answer: String(answer) };
}

function patternPercentIncrease(difficulty) {
  const percent = difficulty === "easy" ? pick([10, 20, 25]) : difficulty === "medium" ? pick([15, 30, 40]) : pick([12, 35, 45]);
  const base = difficulty === "easy" ? pick([40, 80, 100, 120]) : difficulty === "medium" ? pick([80, 120, 160, 200]) : pick([120, 160, 200, 240]);
  const answer = Math.round(base * (1 + percent / 100));
  return { prompt: `${base} increased by ${percent}%`, answer: String(answer) };
}

function patternPercentDecrease(difficulty) {
  const percent = difficulty === "easy" ? pick([10, 20, 25]) : difficulty === "medium" ? pick([15, 30, 40]) : pick([12, 35, 45]);
  const base = difficulty === "easy" ? pick([40, 80, 100, 120]) : difficulty === "medium" ? pick([90, 120, 160, 220]) : pick([140, 180, 220, 300]);
  const answer = Math.round(base * (1 - percent / 100));
  return { prompt: `${base} decreased by ${percent}%`, answer: String(answer) };
}

function patternPercentWhatPercent(difficulty) {
  const denominator = difficulty === "easy" ? pick([20, 40, 50, 80, 100]) : difficulty === "medium" ? pick([60, 80, 120, 150, 200]) : pick([90, 120, 160, 200, 250]);
  const percent = difficulty === "easy" ? pick([10, 20, 25, 50]) : difficulty === "medium" ? pick([15, 30, 40, 60]) : pick([12, 35, 45, 75]);
  const numerator = Math.round((percent / 100) * denominator);
  return { prompt: `What percent is ${numerator} of ${denominator}?`, answer: String(percent) };
}

function patternFractionAdd(difficulty) {
  const denominator = difficulty === "easy" ? pick([2, 4, 5, 8]) : difficulty === "medium" ? pick([3, 4, 5, 6, 8]) : pick([6, 8, 10, 12]);
  const a = randomInt(1, denominator - 1);
  const b = randomInt(1, denominator - 1);
  const simplified = simplifyFraction(a + b, denominator);
  return {
    prompt: `${a}/${denominator} + ${b}/${denominator}`,
    answer: formatFraction(simplified.numerator, simplified.denominator)
  };
}

function patternFractionSubtract(difficulty) {
  const denominator = difficulty === "easy" ? pick([2, 4, 5, 8]) : difficulty === "medium" ? pick([3, 4, 5, 6, 8]) : pick([6, 8, 10, 12]);
  const a = randomInt(2, denominator - 1);
  const b = randomInt(1, a - 1);
  const simplified = simplifyFraction(a - b, denominator);
  return {
    prompt: `${a}/${denominator} - ${b}/${denominator}`,
    answer: formatFraction(simplified.numerator, simplified.denominator)
  };
}

function patternFractionSimplify(difficulty) {
  const denominator = difficulty === "easy" ? pick([4, 6, 8, 10]) : difficulty === "medium" ? pick([6, 8, 10, 12, 14]) : pick([8, 10, 12, 14, 16]);
  const factor = difficulty === "easy" ? pick([2]) : difficulty === "medium" ? pick([2, 3]) : pick([2, 3, 4]);
  const simpleNumerator = randomInt(1, Math.max(2, Math.floor((denominator / factor) - 1)));
  const numerator = simpleNumerator * factor;
  const simpleDenominator = denominator;
  const simplified = simplifyFraction(numerator, simpleDenominator);
  return {
    prompt: `Simplify ${numerator}/${simpleDenominator}`,
    answer: formatFraction(simplified.numerator, simplified.denominator)
  };
}

function patternFractionOfNumber(difficulty) {
  const denominator = difficulty === "easy" ? pick([2, 4, 5]) : difficulty === "medium" ? pick([3, 4, 5, 6]) : pick([4, 5, 6, 8]);
  const numerator = difficulty === "easy" ? 1 : difficulty === "medium" ? pick([1, 2, 3]) : pick([2, 3, 5]);
  const multiplier = difficulty === "easy" ? randomInt(6, 20) : difficulty === "medium" ? randomInt(10, 30) : randomInt(16, 45);
  const number = denominator * multiplier;
  const answer = (numerator * number) / denominator;
  return {
    prompt: `${numerator}/${denominator} of ${number}`,
    answer: String(answer)
  };
}

function patternPowersSquare(difficulty) {
  const value = difficulty === "easy" ? randomInt(2, 12) : difficulty === "medium" ? randomInt(7, 16) : randomInt(12, 25);
  return { prompt: `${value}^2`, answer: String(value * value) };
}

function patternPowersCube(difficulty) {
  const value = difficulty === "easy" ? randomInt(2, 6) : difficulty === "medium" ? randomInt(3, 9) : randomInt(5, 11);
  return { prompt: `${value}^3`, answer: String(value ** 3) };
}

function patternPowersSqrt(difficulty) {
  const root = difficulty === "easy" ? randomInt(3, 12) : difficulty === "medium" ? randomInt(8, 18) : randomInt(12, 24);
  return { prompt: `sqrt(${root * root})`, answer: String(root) };
}

function patternPowersMixed(difficulty) {
  const a = difficulty === "easy" ? randomInt(2, 6) : difficulty === "medium" ? randomInt(3, 10) : randomInt(6, 14);
  const b = difficulty === "easy" ? randomInt(2, 6) : difficulty === "medium" ? randomInt(3, 10) : randomInt(6, 14);
  return {
    prompt: `${a}^2 + ${b}^2`,
    answer: String(a * a + b * b)
  };
}

const PATTERNS_BY_TOPIC = {
  arithmetic: [
    { id: "arith-add", build: patternArithmeticAdd },
    { id: "arith-sub", build: patternArithmeticSubtract },
    { id: "arith-mul", build: patternArithmeticMultiply },
    { id: "arith-div", build: patternArithmeticDivide },
    { id: "arith-mixed", build: patternArithmeticMixed },
    { id: "arith-miss-add", build: patternArithmeticMissingAdd },
    { id: "arith-miss-sub", build: patternArithmeticMissingSubtract }
  ],
  "mental-math": [
    { id: "mental-25x", build: patternMentalMultiply25 },
    { id: "mental-50x", build: patternMentalMultiply50 },
    { id: "mental-near100-add", build: patternMentalNearHundredAdd },
    { id: "mental-near100-sub", build: patternMentalNearHundredSubtract },
    { id: "mental-double", build: patternMentalDouble },
    { id: "mental-half", build: patternMentalHalf }
  ],
  algebra: [
    { id: "alg-add", build: patternAlgebraAdd },
    { id: "alg-mul", build: patternAlgebraMultiply },
    { id: "alg-linear", build: patternAlgebraLinear },
    { id: "alg-bracket", build: patternAlgebraBracket }
  ],
  percentages: [
    { id: "pct-of", build: patternPercentOf },
    { id: "pct-up", build: patternPercentIncrease },
    { id: "pct-down", build: patternPercentDecrease },
    { id: "pct-what", build: patternPercentWhatPercent }
  ],
  fractions: [
    { id: "frac-add", build: patternFractionAdd },
    { id: "frac-sub", build: patternFractionSubtract },
    { id: "frac-simplify", build: patternFractionSimplify },
    { id: "frac-of", build: patternFractionOfNumber }
  ],
  powers: [
    { id: "pow-square", build: patternPowersSquare },
    { id: "pow-cube", build: patternPowersCube },
    { id: "pow-sqrt", build: patternPowersSqrt },
    { id: "pow-mixed", build: patternPowersMixed }
  ]
};

function generateQuestion(topic, difficulty, scopeKey = "global") {
  const safeTopic = TOPICS.includes(topic) ? topic : "arithmetic";
  const safeDifficulty = DIFFICULTIES.includes(difficulty) ? difficulty : "easy";

  if (safeTopic === "mixed") {
    const baseTopics = Object.keys(PATTERNS_BY_TOPIC);
    const mixedTopicPattern = pickPattern(
      baseTopics.map((topicName) => ({
        id: `mixed-topic:${topicName}`,
        build: () => ({ prompt: topicName, answer: topicName }),
        topicName
      })),
      scopeKey,
      "mixed",
      safeDifficulty
    );
    const selectedTopic = mixedTopicPattern.topicName;
    const selectedPattern = pickPattern(
      PATTERNS_BY_TOPIC[selectedTopic],
      scopeKey,
      `${selectedTopic}:mixed`,
      safeDifficulty
    );
    return selectedPattern.build(safeDifficulty);
  }

  const patterns = PATTERNS_BY_TOPIC[safeTopic];
  const selectedPattern = pickPattern(patterns, scopeKey, safeTopic, safeDifficulty);
  return selectedPattern.build(safeDifficulty);
}

function normalizeAnswer(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/%/g, "");
}

function isValidTopic(value) {
  return TOPICS.includes(value);
}

function isValidDifficulty(value) {
  return DIFFICULTIES.includes(value);
}

module.exports = {
  TOPICS,
  DIFFICULTIES,
  generateQuestion,
  normalizeAnswer,
  isValidTopic,
  isValidDifficulty
};
