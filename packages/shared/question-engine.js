/**
 * Production question engine for fast multiplayer duels.
 *
 * Design goals:
 * - topic-specific generators
 * - cognitively-scored difficulty
 * - strict validation + rejection
 * - plausible distractors
 * - subtype variety + repeat suppression
 */

const {
  TOPICS,
  DIFFICULTIES,
  GLOBAL_TUNING,
  DIFFICULTY_PROFILE,
  normalizeTopic,
  normalizeDifficulty,
  isValidTopic,
  isValidDifficulty,
  getRules,
  getQuestionTimerSeconds,
  getMatchDurationSeconds,
} = require("./difficulty-framework");
const {
  GRAPH_RANGE_PRESETS,
  GRAPH_SUBTYPE_WEIGHTS,
  GRAPH_VISUAL_TUNING,
} = require("./graphs-functions-config");
const {
  QUESTION_FORMATS,
  TOPIC_ALLOWED_FORMATS,
  FORMAT_WEIGHTS_BY_DIFFICULTY,
  ROUND_CATEGORY_SEQUENCE,
  ROUND_CATEGORY_FORMAT_BIAS,
  FORMAT_VALIDATION,
} = require("./question-engine-config");

const RECENT_SUBTYPE_BY_SCOPE = new Map();
const RECENT_QUESTION_KEYS_BY_SCOPE = new Map();
const RECENT_FORMAT_BY_SCOPE = new Map();
const FORMAT_STATS_BY_SCOPE = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item;
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

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
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

function parseNumberLoose(value) {
  const s = String(value ?? "")
    .trim()
    .replace(/,/g, "")
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
    .replace(/\u00f7/g, "/")
    .replace(/\*/g, "");
}

function normalizeExpressionText(value) {
  return normalizeText(value)
    .replace(/[−–—]/g, "-")
    .replace(/·/g, "")
    .replace(/\(\)/g, "")
    .replace(/\+\-/g, "-")
    .replace(/\-\+/g, "-")
    .replace(/\-\-/g, "+")
    .replace(/1x/g, "x")
    .replace(/\+\+/g, "+");
}

function countOps(prompt) {
  const s = String(prompt ?? "");
  return (
    (s.match(/\+/g) ?? []).length +
    (s.match(/\-/g) ?? []).length +
    (s.match(/[xX\*\u00d7]/g) ?? []).length +
    (s.match(/[\u00f7\/]/g) ?? []).length
  );
}

function calcDifficultyScore(cognitive, difficulty) {
  const stepsNorm = clamp((cognitive.steps ?? 1) / 4, 0, 1);
  const abstraction = clamp(cognitive.abstraction ?? 0.2, 0, 1);
  const notation = clamp(cognitive.notationComplexity ?? 0.2, 0, 1);
  const visual = clamp(cognitive.visualInterpretation ?? 0, 0, 1);
  const mistake = clamp(cognitive.mistakeLikelihood ?? 0.2, 0, 1);

  const raw =
    stepsNorm * 0.32 +
    abstraction * 0.2 +
    notation * 0.16 +
    visual * 0.16 +
    mistake * 0.16;

  const band = DIFFICULTY_PROFILE[difficulty].scoreBand;
  return clamp(raw, band[0], band[1]);
}

function questionKey(question) {
  return normalizeText(`${question.topic}|${question.difficulty}|${question.subtype}|${question.prompt}|${question.correctAnswer}`);
}

function getRecentSubtypeKey(scopeKey, topic, difficulty) {
  return `${scopeKey}:${topic}:${difficulty}:subtype`;
}

function getRecentQuestionKey(scopeKey, topic, difficulty) {
  return `${scopeKey}:${topic}:${difficulty}:question`;
}

function pickSubtypeWithRotation(defs, scopeKey, topic, difficulty) {
  if (defs.length === 1) return defs[0];
  const key = getRecentSubtypeKey(scopeKey, topic, difficulty);
  const recent = RECENT_SUBTYPE_BY_SCOPE.get(key) ?? [];
  const blocked = new Set(recent);
  const allowed = defs.filter((d) => !blocked.has(d.subtype));
  const chosen = pickWeighted(allowed.length > 0 ? allowed : defs);
  const next = [...recent, chosen.subtype].slice(-GLOBAL_TUNING.recentSubtypeHistory);
  RECENT_SUBTYPE_BY_SCOPE.set(key, next);
  return chosen;
}

function isRepeatedQuestion(scopeKey, topic, difficulty, key) {
  const mapKey = getRecentQuestionKey(scopeKey, topic, difficulty);
  const recent = RECENT_QUESTION_KEYS_BY_SCOPE.get(mapKey) ?? [];
  return recent.includes(key);
}

function rememberQuestion(scopeKey, topic, difficulty, key) {
  const mapKey = getRecentQuestionKey(scopeKey, topic, difficulty);
  const recent = RECENT_QUESTION_KEYS_BY_SCOPE.get(mapKey) ?? [];
  RECENT_QUESTION_KEYS_BY_SCOPE.set(mapKey, [...recent, key].slice(-GLOBAL_TUNING.recentQuestionHistory));
}

function getRecentFormatKey(scopeKey, topic, difficulty) {
  return `${scopeKey}:${topic}:${difficulty}:format`;
}

function getFormatStatsKey(scopeKey, topic, difficulty) {
  return `${scopeKey}:${topic}:${difficulty}:format-stats`;
}

function getFormatStats(scopeKey, topic, difficulty) {
  const key = getFormatStatsKey(scopeKey, topic, difficulty);
  const existing = FORMAT_STATS_BY_SCOPE.get(key);
  if (existing) return existing;
  const created = {
    total: 0,
    counts: Object.create(null),
    recent: [],
  };
  FORMAT_STATS_BY_SCOPE.set(key, created);
  return created;
}

function rememberFormat(scopeKey, topic, difficulty, format) {
  const key = getRecentFormatKey(scopeKey, topic, difficulty);
  const recent = RECENT_FORMAT_BY_SCOPE.get(key) ?? [];
  const nextRecent = [...recent, format].slice(-FORMAT_VALIDATION.recentFormatWindow);
  RECENT_FORMAT_BY_SCOPE.set(key, nextRecent);

  const stats = getFormatStats(scopeKey, topic, difficulty);
  stats.total += 1;
  stats.counts[format] = (stats.counts[format] ?? 0) + 1;
  stats.recent = [...stats.recent, format].slice(-FORMAT_VALIDATION.recentFormatWindow);
}

function getRoundCategory(roundIndex) {
  if (!Number.isFinite(roundIndex) || roundIndex < 0) return "normal_round";
  return ROUND_CATEGORY_SEQUENCE[roundIndex % ROUND_CATEGORY_SEQUENCE.length] ?? "normal_round";
}

function shuffle(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickDistinctWrongs(correctAnswer, wrongAnswers, answerType, desired = 3) {
  const picked = uniqueWrongAnswers(correctAnswer, answerType, wrongAnswers, desired);
  if (picked.length >= desired) return picked;

  const correctNum = parseNumberLoose(correctAnswer);
  if (correctNum !== null) {
    const fallback = [correctNum - 1, correctNum + 1, correctNum + 2, correctNum - 2].map(String);
    return uniqueWrongAnswers(correctAnswer, answerType, [...picked, ...fallback], desired);
  }

  return uniqueWrongAnswers(correctAnswer, answerType, [...picked, "None", "Cannot determine", "0"], desired);
}

function parseGenerationContext(scopeKeyOrOptions = "global", maybeOptions = {}) {
  if (scopeKeyOrOptions && typeof scopeKeyOrOptions === "object") {
    const opts = scopeKeyOrOptions;
    return {
      scopeKey: typeof opts.scopeKey === "string" ? opts.scopeKey : "global",
      roundIndex: Number.isFinite(opts.roundIndex) ? opts.roundIndex : null,
      roundCategory: typeof opts.roundCategory === "string" ? opts.roundCategory : null,
      forceFormat: typeof opts.forceFormat === "string" ? opts.forceFormat : null,
      formatWeights: opts.formatWeights && typeof opts.formatWeights === "object" ? opts.formatWeights : null,
    };
  }

  return {
    scopeKey: typeof scopeKeyOrOptions === "string" ? scopeKeyOrOptions : "global",
    roundIndex: Number.isFinite(maybeOptions?.roundIndex) ? maybeOptions.roundIndex : null,
    roundCategory: typeof maybeOptions?.roundCategory === "string" ? maybeOptions.roundCategory : null,
    forceFormat: typeof maybeOptions?.forceFormat === "string" ? maybeOptions.forceFormat : null,
    formatWeights: maybeOptions?.formatWeights && typeof maybeOptions.formatWeights === "object" ? maybeOptions.formatWeights : null,
  };
}

function toNumericRankingValue(value) {
  const n = parseNumberLoose(value);
  if (n !== null) return n;
  const frac = parseFraction(value);
  if (frac) return frac.n / frac.d;
  return null;
}

function isFillInEligible(question, difficulty) {
  if (!FORMAT_VALIDATION.fillInAllowedAnswerTypes.has(question.answerType)) return false;
  if (String(question.correctAnswer ?? "").length > FORMAT_VALIDATION.fillInMaxAnswerLength) return false;
  if (String(question.prompt ?? "").length > FORMAT_VALIDATION.fillInPromptMaxLength) return false;
  const steps = Number(question?.cognitive?.steps ?? 1);
  const maxSteps = FORMAT_VALIDATION.fillInMaxCognitiveStepsByDifficulty[difficulty] ?? 2;
  if (steps > maxSteps) return false;

  const correct = String(question.correctAnswer ?? "").trim();
  if (question.answerType === "text") {
    return FORMAT_VALIDATION.fillInExpressionSafePattern.test(
      normalizeExpressionText(correct).replace(/\^/g, "")
    );
  }

  if (question.answerType === "fraction") {
    return Boolean(parseFraction(correct));
  }

  return parseNumberLoose(correct) !== null;
}

function isRankOrderEligible(question) {
  const allValues = [question.correctAnswer, ...(question.wrongAnswers ?? [])];
  const numericCount = allValues.filter((x) => toNumericRankingValue(x) !== null).length;
  return numericCount >= 4;
}

function recentConsecutiveCount(recent, format) {
  let count = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] !== format) break;
    count += 1;
  }
  return count;
}

function chooseQuestionFormat(topic, difficulty, question, scopeKey, context) {
  const allowed = TOPIC_ALLOWED_FORMATS[topic] ?? [QUESTION_FORMATS.MULTIPLE_CHOICE];
  const roundCategory = context.roundCategory ?? getRoundCategory(context.roundIndex ?? -1);
  const byDifficulty = FORMAT_WEIGHTS_BY_DIFFICULTY[difficulty] ?? {};
  const roundBias = ROUND_CATEGORY_FORMAT_BIAS[roundCategory] ?? ROUND_CATEGORY_FORMAT_BIAS.normal_round;
  const customWeights = context.formatWeights ?? {};

  if (context.forceFormat && allowed.includes(context.forceFormat)) {
    return context.forceFormat;
  }

  const recencyKey = getRecentFormatKey(scopeKey, topic, difficulty);
  const recent = RECENT_FORMAT_BY_SCOPE.get(recencyKey) ?? [];
  const stats = getFormatStats(scopeKey, topic, difficulty);

  const validPool = allowed.filter((format) => {
    if (format === QUESTION_FORMATS.FILL_IN) return isFillInEligible(question, difficulty);
    if (format === QUESTION_FORMATS.RANK_ORDER) return isRankOrderEligible(question);
    return true;
  });

  const candidates = validPool
    .map((format) => {
      const base = byDifficulty[format] ?? 1;
      const bias = roundBias[format] ?? 1;
      const custom = Number.isFinite(customWeights[format]) ? customWeights[format] : 1;
      const used = stats.counts[format] ?? 0;
      const minUsed = validPool.reduce((m, f) => Math.min(m, stats.counts[f] ?? 0), Number.POSITIVE_INFINITY);
      const leastUsedGap = Math.max(0, used - minUsed);
      const leastUsedBoost = leastUsedGap === 0 ? FORMAT_VALIDATION.leastUsedBoost : 1 / (1 + leastUsedGap);

      const recentPenalty = recent.includes(format) ? FORMAT_VALIDATION.recencyPenaltyBase : 1;
      const consecutive = recentConsecutiveCount(recent, format);
      const hardBlock = consecutive >= FORMAT_VALIDATION.hardBlockSameFormatStreak && validPool.length > 1;
      if (hardBlock) {
        return { format, weight: 0 };
      }

      const streakPenalty =
        consecutive >= FORMAT_VALIDATION.maxConsecutiveSameFormat
          ? 0.08
          : 1 / (1 + consecutive * 0.65);

      let weight = base * bias * custom * leastUsedBoost * recentPenalty * streakPenalty;
      weight *= 0.7 + Math.random() * 0.6; // keep distribution balanced but still random.
      return { format, weight: Math.max(0.0001, weight) };
    })
    .filter((x) => x.weight > 0);

  if (candidates.length === 0) return QUESTION_FORMATS.MULTIPLE_CHOICE;
  return pickWeighted(candidates).format;
}

function buildRankOrderOptions(correctOrder) {
  const [a, b, c, d] = correctOrder;
  const options = [
    [a, b, c, d],
    [a, c, b, d],
    [b, a, c, d],
    [a, b, d, c],
  ].map((row) => row.join(" < "));

  return [...new Set(options)];
}

function applyQuestionFormat(question, topic, difficulty, scopeKey, context) {
  const format = chooseQuestionFormat(topic, difficulty, question, scopeKey, context);
  const wrongAnswers = pickDistinctWrongs(question.correctAnswer, question.wrongAnswers ?? [], question.answerType, 3);
  const questionWithFormat = { ...question, format, wrongAnswers };

  if (format === QUESTION_FORMATS.MULTIPLE_CHOICE) {
    const options = shuffle([question.correctAnswer, ...wrongAnswers]).slice(0, FORMAT_VALIDATION.mcqOptionCount);
    questionWithFormat.options = options;
    questionWithFormat.inputMode = "text";
    questionWithFormat.validationMeta = {
      isClear: true,
      isAmbiguous: false,
      expectedSteps: question.cognitive?.steps ?? 1,
    };
    return questionWithFormat;
  }

  if (format === QUESTION_FORMATS.TRUE_FALSE) {
    const claimIsTrue = Math.random() < 0.5;
    const candidate = claimIsTrue ? question.correctAnswer : pick(wrongAnswers);
    const basePrompt = String(question.prompt).replace(/[?.]\s*$/, "");
    questionWithFormat.prompt = `True or False: ${basePrompt}. The answer is ${candidate}.`;
    questionWithFormat.correctAnswer = claimIsTrue ? "True" : "False";
    questionWithFormat.answer = questionWithFormat.correctAnswer;
    questionWithFormat.acceptedAnswers = [questionWithFormat.correctAnswer.toLowerCase()];
    questionWithFormat.answerType = "text";
    questionWithFormat.inputMode = "text";
    questionWithFormat.options = [...FORMAT_VALIDATION.trueFalseOptions];
    questionWithFormat.validationMeta = {
      isClear: true,
      isAmbiguous: false,
      expectedSteps: Math.min(2, question.cognitive?.steps ?? 1),
    };
    return questionWithFormat;
  }

  if (format === QUESTION_FORMATS.RANK_ORDER) {
    const sortable = [question.correctAnswer, ...wrongAnswers]
      .map((raw) => ({ raw: String(raw), value: toNumericRankingValue(raw) }))
      .filter((entry) => entry.value !== null);

    const deduped = [];
    const seen = new Set();
    for (const entry of sortable) {
      const key = normalizeComparable(entry.raw, question.answerType);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }

    const canonical = deduped
      .sort((a, b) => a.value - b.value)
      .slice(0, FORMAT_VALIDATION.rankOrderMaxItems)
      .map((entry) => entry.raw);

    if (canonical.length < 4) {
      return applyQuestionFormat({ ...question, format: QUESTION_FORMATS.MULTIPLE_CHOICE }, topic, difficulty, scopeKey, {
        ...context,
        forceFormat: QUESTION_FORMATS.MULTIPLE_CHOICE,
      });
    }

    const options = buildRankOrderOptions(canonical);
    const correctOrder = canonical.join(" < ");
    questionWithFormat.prompt = `Rank from smallest to largest: ${canonical.join(", ")}`;
    questionWithFormat.correctAnswer = correctOrder;
    questionWithFormat.answer = correctOrder;
    questionWithFormat.acceptedAnswers = [correctOrder.replace(/\s+/g, ""), canonical.join("<"), canonical.join(" < ")];
    questionWithFormat.answerType = "text";
    questionWithFormat.inputMode = "text";
    questionWithFormat.options = shuffle(options).slice(0, FORMAT_VALIDATION.mcqOptionCount);
    if (!questionWithFormat.options.includes(correctOrder)) {
      questionWithFormat.options[0] = correctOrder;
      questionWithFormat.options = shuffle(questionWithFormat.options);
    }
    questionWithFormat.validationMeta = {
      isClear: true,
      isAmbiguous: false,
      expectedSteps: Math.max(2, question.cognitive?.steps ?? 1),
    };
    return questionWithFormat;
  }

  // fill_in
  questionWithFormat.options = undefined;
  questionWithFormat.inputMode = question.answerType === "text" ? "text" : "number";
  questionWithFormat.validationMeta = {
    isClear: true,
    isAmbiguous: false,
    expectedSteps: question.cognitive?.steps ?? 1,
  };
  return questionWithFormat;
}

function buildFractionDistractors(frac, seeds = []) {
  const out = [];
  for (const s of seeds) out.push(String(s));
  out.push(formatFraction(frac.d, frac.n || 1));
  out.push(formatFraction(frac.n + 1, frac.d));
  out.push(formatFraction(frac.n, frac.d + 1));
  if (frac.n > 1) out.push(formatFraction(frac.n - 1, frac.d));
  return [...new Set(out)];
}

function uniqueWrongAnswers(correctAnswer, answerType, candidates, desiredCount = 3) {
  const normalizedCorrect = normalizeComparable(correctAnswer, answerType);
  const out = [];
  const seen = new Set();

  for (const value of candidates) {
    const asString = String(value).trim();
    if (!asString) continue;
    const normalized = normalizeComparable(asString, answerType);
    if (!normalized || normalized === normalizedCorrect || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(asString);
    if (out.length >= desiredCount) break;
  }

  return out;
}

function normalizeComparable(value, answerType) {
  if (answerType === "fraction") {
    const frac = parseFraction(value);
    if (frac) return `${frac.n}/${frac.d}`;
  }

  if (answerType === "number" || answerType === "percent" || answerType === "int" || answerType === "angle") {
    const n = parseNumberLoose(value);
    if (n !== null) {
      if (answerType === "int" || answerType === "angle") return String(Math.trunc(n));
      return String(n);
    }
  }

  return normalizeExpressionText(value);
}

function isCorrectAgainstType(userAnswer, expected, answerType) {
  if (answerType === "fraction") {
    const uf = parseFraction(userAnswer);
    const ef = parseFraction(expected);
    if (uf && ef) return uf.n === ef.n && uf.d === ef.d;
    const un = parseNumberLoose(userAnswer);
    const en = ef ? ef.n / ef.d : parseNumberLoose(expected);
    if (un === null || en === null) return false;
    return Math.abs(un - en) < 1e-9;
  }

  if (answerType === "int" || answerType === "angle") {
    const un = parseNumberLoose(userAnswer);
    const en = parseNumberLoose(expected);
    if (un === null || en === null) return false;
    return Math.trunc(un) === Math.trunc(en);
  }

  if (answerType === "percent") {
    const un = parseNumberLoose(userAnswer);
    const en = parseNumberLoose(expected);
    if (un === null || en === null) return false;
    const direct = Math.abs(un - en) < 1e-9;
    const scaledDown = Math.abs(un / 100 - en) < 1e-9;
    const scaledUp = Math.abs(un - en / 100) < 1e-9;
    return direct || scaledDown || scaledUp;
  }

  if (answerType === "number") {
    const un = parseNumberLoose(userAnswer);
    const en = parseNumberLoose(expected);
    if (un === null || en === null) return false;
    return Math.abs(un - en) < 1e-9;
  }

  return normalizeExpressionText(userAnswer) === normalizeExpressionText(expected);
}

function isCorrectAnswer(userAnswer, questionOrAnswer, answerType = "text") {
  if (questionOrAnswer && typeof questionOrAnswer === "object") {
    const question = questionOrAnswer;
    const candidates = [question.correctAnswer ?? question.answer, ...(question.acceptedAnswers ?? [])]
      .filter(Boolean)
      .map((x) => String(x));
    const type = question.answerType ?? answerType;
    return candidates.some((expected) => isCorrectAgainstType(userAnswer, expected, type));
  }

  return isCorrectAgainstType(userAnswer, String(questionOrAnswer ?? ""), answerType);
}

function normalizeAnswer(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const frac = parseFraction(raw);
  if (frac) {
    return `${frac.n}/${frac.d}`;
  }

  const n = parseNumberLoose(raw);
  if (n !== null) {
    const normalized = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(10)));
    return normalized.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  return normalizeExpressionText(raw);
}

function buildQuestionId(topic, subtype, difficulty) {
  const now = Date.now().toString(36);
  const rand = randomInt(10000, 99999).toString(36);
  return `${topic}-${subtype}-${difficulty}-${now}-${rand}`;
}

function averageSeconds(range) {
  return Math.round((range[0] + range[1]) / 2);
}

function buildQuestionObject(topic, difficulty, subtype, draft, rules) {
  const correctAnswer =
    Array.isArray(draft.correctAnswer)
      ? draft.correctAnswer.map((x) => String(x).trim()).filter(Boolean).join(" < ")
      : String(draft.correctAnswer).trim();
  const answerType = draft.answerType ?? "int";
  const inputMode = draft.inputMode ?? (answerType === "text" ? "text" : "number");
  const renderMode = draft.renderMode ?? "plain_text";
  const estimatedSolveTime = draft.estimatedSolveTime ?? averageSeconds(rules.profile.expectedSolveSeconds);
  const cognitive = {
    steps: draft.cognitive?.steps ?? 1,
    abstraction: clamp(draft.cognitive?.abstraction ?? 0.2, 0, 1),
    notationComplexity: clamp(draft.cognitive?.notationComplexity ?? 0.2, 0, 1),
    visualInterpretation: clamp(draft.cognitive?.visualInterpretation ?? 0, 0, 1),
    mistakeLikelihood: clamp(draft.cognitive?.mistakeLikelihood ?? 0.2, 0, 1),
  };
  const difficultyScore = Number(calcDifficultyScore(cognitive, difficulty).toFixed(3));

  const wrongAnswers = uniqueWrongAnswers(
    correctAnswer,
    answerType,
    Array.isArray(draft.wrongAnswers) ? draft.wrongAnswers : [],
    3
  );

  return {
    id: buildQuestionId(topic, subtype, difficulty),
    topic,
    difficulty,
    subtype,
    prompt: String(draft.prompt ?? "").trim(),

    correctAnswer,
    wrongAnswers,
    explanation: String(draft.explanation ?? "").trim(),
    estimatedSolveTime,
    difficultyScore,

    renderMode,
    visualData: draft.visualData ?? null,
    visualType: draft.visualType ?? (renderMode === "graph" ? "coordinate" : renderMode === "diagram" ? "shape" : "none"),
    diagramSpec: draft.diagramSpec ?? null,

    answer: correctAnswer,
    acceptedAnswers: Array.isArray(draft.acceptedAnswers) ? draft.acceptedAnswers.map((v) => String(v)) : [],
    answerType,
    inputMode,
    timeSuitability: "rapid",
    unit: draft.unit ?? null,
    formatting: {
      style: draft.formatting?.style ?? (renderMode === "latex" ? "math" : "plain"),
      expression: draft.formatting?.expression ?? null,
      unit: draft.formatting?.unit ?? null,
    },
    cognitive,
    gameplayDifficulty: {
      level: difficulty,
      rubric: {
        maxSteps: rules.profile.maxSteps,
        expectedSeconds: rules.profile.expectedSolveSeconds,
      },
    },
    timing: {
      expectedSolveSeconds: estimatedSolveTime,
      questionTimerSeconds: getQuestionTimerSeconds(topic, difficulty),
      matchDurationSeconds: getMatchDurationSeconds(difficulty),
    },
    meta: {
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      generationPolicy: "topic-specific-cognitive",
      validatorVersion: "v2",
    },
    format: draft.format ?? QUESTION_FORMATS.MULTIPLE_CHOICE,
    options: Array.isArray(draft.options) ? draft.options.map((x) => String(x)) : undefined,
    validationMeta: draft.validationMeta ?? null,
  };
}

function hasMojibake(s) {
  return /Ã|â|�/.test(String(s ?? ""));
}

function isIntegerInRange(n, min, max) {
  return Number.isInteger(n) && n >= min && n <= max;
}

function hasOverlapRisk(points) {
  const seen = new Set();
  for (const p of points) {
    const key = `${p.x}:${p.y}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function validateGraphVisualData(question, difficulty) {
  const visualData = question?.visualData;
  const graphSpec = question?.diagramSpec?.kind === "graph-cartesian" ? question.diagramSpec : null;
  const source = visualData ?? graphSpec;
  if (!source) return question.renderMode !== "graph";

  const xMin = source.xMin ?? source.xRange?.[0];
  const xMax = source.xMax ?? source.xRange?.[1];
  const yMin = source.yMin ?? source.yRange?.[0];
  const yMax = source.yMax ?? source.yRange?.[1];
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return false;
  if (!(xMin < xMax && yMin < yMax)) return false;
  if (xMax - xMin > 24 || yMax - yMin > 24) return false;
  if (xMax - xMin + 1 > GRAPH_VISUAL_TUNING.maxGridTicksPerAxis) return false;
  if (yMax - yMin + 1 > GRAPH_VISUAL_TUNING.maxGridTicksPerAxis) return false;

  const showAxisNumbers = source.showAxisNumbers ?? graphSpec?.showAxisNumbers ?? true;
  if (difficulty === "easy" && !showAxisNumbers) return false;

  const points = source.points ?? graphSpec?.points ?? [];
  const lines = source.lines ?? graphSpec?.lines ?? [];
  if (!Array.isArray(points) || !Array.isArray(lines)) return false;
  if (points.length === 0 && lines.length === 0) return false;
  if (points.length > 6 || lines.length > 3) return false;
  if (hasOverlapRisk(points)) return false;

  for (const point of points) {
    if (!isIntegerInRange(point.x, xMin, xMax) || !isIntegerInRange(point.y, yMin, yMax)) return false;
    if (point.x <= xMin || point.x >= xMax || point.y <= yMin || point.y >= yMax) return false;
  }

  for (const line of lines) {
    if (!Number.isFinite(line.m) || !Number.isFinite(line.b)) return false;
    if (Math.abs(line.m) > 8 || Math.abs(line.b) > 20) return false;
  }

  if (question.subtype === "read_x_coordinate" || question.subtype === "read_y_coordinate" || question.subtype === "read_point_coordinate") {
    if (points.length !== 1) return false;
  }

  if (difficulty === "easy" && (lines.length > 1 || points.length > 2)) return false;

  return true;
}

function validateQuestionShape(topic, difficulty, question) {
  const rules = getRules(topic, difficulty);
  const prompt = String(question?.prompt ?? "").trim();
  if (!prompt) return false;
  if (prompt.length > rules.maxExpressionLength + 30) return false;
  if (hasMojibake(prompt)) return false;
  if (/\s{2,}/.test(prompt)) return false;

  const opCount = countOps(prompt);
  // Operator-count throttling is useful for raw arithmetic expressions,
  // but it over-penalizes symbolic prompts (e.g., f(x), f'(x)) in algebra/calculus.
  if (topic === "arithmetic") {
    if (rules.difficulty === "easy" && opCount > 2) return false;
    if (rules.difficulty === "medium" && opCount > 4) return false;
  }

  if (topic === "arithmetic" && difficulty === "easy") {
    if (/[()]/.test(prompt)) return false;
    if (/\//.test(prompt) || /\u00f7/.test(prompt) || /x|\*/i.test(prompt)) return false;
  }

  if (topic === "algebra") {
    if (!/\bsolve\b|\bevaluate\b/i.test(prompt)) return false;
    if (!/x/.test(prompt)) return false;
  }

  if (topic === "calculus") {
    if (!/f\s*\(x\)\s*=/.test(prompt)) return false;
    if (!/\b(find|evaluate)\b/i.test(prompt)) return false;
    if (/^f\s*\(x\)\s*=.+$/i.test(prompt) && !/\b(find|evaluate)\b/i.test(prompt)) return false;
  }

  return true;
}

function validateQuestion(topic, difficulty, question) {
  if (!validateQuestionShape(topic, difficulty, question)) {
    return false;
  }

  const rules = getRules(topic, difficulty);
  const profile = rules.profile;

  const requiredStrings = [question.prompt, question.correctAnswer, question.explanation, question.subtype];
  if (requiredStrings.some((v) => typeof v !== "string" || !v.trim())) return false;
  if (topic === "graphs_functions" && String(question.prompt).length > 90) return false;

  if (!Array.isArray(question.wrongAnswers) || question.wrongAnswers.length < 3) return false;
  if (new Set(question.wrongAnswers.map((x) => normalizeComparable(x, question.answerType))).size < 3) return false;

  const normalizedCorrect = normalizeComparable(question.correctAnswer, question.answerType);
  const wrongHasCorrect = question.wrongAnswers.some((w) => normalizeComparable(w, question.answerType) === normalizedCorrect);
  if (wrongHasCorrect) return false;

  if (!Number.isFinite(question.estimatedSolveTime)) return false;
  const [minSolve, maxSolve] = profile.expectedSolveSeconds;
  if (question.estimatedSolveTime < minSolve - 1 || question.estimatedSolveTime > maxSolve + 2) return false;

  if (!Number.isFinite(question.difficultyScore)) return false;
  const [minScore, maxScore] = profile.scoreBand;
  if (question.difficultyScore < minScore || question.difficultyScore > maxScore) return false;

  const c = question.cognitive ?? {};
  if (!Number.isFinite(c.steps) || c.steps < 1 || c.steps > profile.maxSteps) return false;
  if (!Number.isFinite(c.abstraction) || !Number.isFinite(c.notationComplexity)) return false;
  if (!Number.isFinite(c.visualInterpretation) || !Number.isFinite(c.mistakeLikelihood)) return false;

  if ((question.renderMode === "diagram" || question.renderMode === "graph") && !question.diagramSpec) return false;
  if (question.renderMode === "graph" && !validateGraphVisualData(question, difficulty)) return false;
  if (question.renderMode === "table" && !(question.visualData?.tables && question.visualData.tables.length >= 3)) return false;

  if (rules.visualRequired && question.renderMode === "plain_text") return false;

  if (hasMojibake(question.correctAnswer) || hasMojibake(question.explanation)) return false;

  const numericAnswer = parseNumberLoose(question.correctAnswer);
  if (difficulty === "easy" && numericAnswer !== null && Math.abs(numericAnswer) > (rules.numberCeiling ?? 9999)) return false;

  const format = question.format ?? QUESTION_FORMATS.MULTIPLE_CHOICE;
  if (!Object.values(QUESTION_FORMATS).includes(format)) return false;
  const allowedFormats = TOPIC_ALLOWED_FORMATS[topic] ?? [QUESTION_FORMATS.MULTIPLE_CHOICE];
  if (!allowedFormats.includes(format)) return false;

  if (format === QUESTION_FORMATS.MULTIPLE_CHOICE) {
    if (!Array.isArray(question.options) || question.options.length !== FORMAT_VALIDATION.mcqOptionCount) return false;
    const normalizedOptions = question.options.map((x) => normalizeComparable(x, question.answerType));
    if (new Set(normalizedOptions).size !== FORMAT_VALIDATION.mcqOptionCount) return false;
    if (!normalizedOptions.includes(normalizedCorrect)) return false;
  }

  if (format === QUESTION_FORMATS.TRUE_FALSE) {
    if (!Array.isArray(question.options) || question.options.length !== 2) return false;
    const opts = new Set(question.options);
    if (!(opts.has("True") && opts.has("False"))) return false;
    if (!["True", "False"].includes(question.correctAnswer)) return false;
    if (String(question.prompt).length > FORMAT_VALIDATION.trueFalsePromptMaxLength) return false;
    if (/not\s+untrue|not\s+false|double negative/i.test(question.prompt)) return false;
  }

  if (format === QUESTION_FORMATS.RANK_ORDER) {
    if (!Array.isArray(question.options) || question.options.length !== FORMAT_VALIDATION.mcqOptionCount) return false;
    if (String(question.correctAnswer).split("<").length > FORMAT_VALIDATION.rankOrderMaxItems) return false;
  }

  if (format === QUESTION_FORMATS.FILL_IN) {
    if (question.options && question.options.length > 0) return false;
    if (!isFillInEligible(question, difficulty)) return false;
  }

  return true;
}

function fallbackQuestion(topic, difficulty) {
  const rules = getRules(topic, difficulty);
  if (rules.visualRequired) {
    const w = randomInt(4, 12);
    const h = randomInt(3, 10);
    const correct = String(2 * (w + h));
    return buildQuestionObject(topic, difficulty, "fallback-visual-rectangle-perimeter", {
      prompt: `Find the perimeter of the rectangle shown.`,
      correctAnswer: correct,
      wrongAnswers: [String(w * h), String(w + h), String(2 * w + h)],
      explanation: `Perimeter = 2(w + h).`,
      estimatedSolveTime: Math.max(4, rules.profile.expectedSolveSeconds[0]),
      renderMode: "diagram",
      answerType: "int",
      diagramSpec: { kind: "rectangle", width: w, height: h },
      cognitive: {
        steps: Math.min(2, rules.profile.maxSteps),
        abstraction: 0.22,
        notationComplexity: 0.22,
        visualInterpretation: 0.35,
        mistakeLikelihood: 0.28,
      },
      tags: ["fallback", "visual"],
    }, rules);
  }

  const a = randomInt(6, 16);
  const b = randomInt(4, 14);
  const correct = String(a + b);
  return buildQuestionObject(topic, difficulty, "fallback-clean-add", {
    prompt: `${a} + ${b}`,
    correctAnswer: correct,
    wrongAnswers: [String(a + b + 1), String(a + b - 1), String(a + b + 2)],
    explanation: `Add ${a} and ${b}.`,
    estimatedSolveTime: Math.max(2, rules.profile.expectedSolveSeconds[0]),
    renderMode: "plain_text",
    answerType: "int",
    cognitive: {
      steps: 1,
      abstraction: 0.1,
      notationComplexity: 0.1,
      visualInterpretation: 0,
      mistakeLikelihood: 0.15,
    },
    tags: ["fallback"],
  }, rules);
}

function arithmeticGenerators() {
  return {
    easy: [
      {
        subtype: "single-step-add",
        weight: 5,
        generate() {
          const a = randomInt(3, 18);
          const b = randomInt(2, 12);
          const correct = a + b;
          return {
            prompt: `${a} + ${b}`,
            correctAnswer: String(correct),
            wrongAnswers: [correct - 1, correct + 1, a + b + 10],
            explanation: `Single-step addition: ${a} + ${b} = ${correct}.`,
            estimatedSolveTime: randomInt(2, 4),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 1, abstraction: 0.08, notationComplexity: 0.06, visualInterpretation: 0, mistakeLikelihood: 0.14 },
            tags: ["arithmetic", "addition", "easy"],
          };
        },
      },
      {
        subtype: "single-step-subtract",
        weight: 5,
        generate() {
          const b = randomInt(2, 12);
          const correct = randomInt(4, 20);
          const a = correct + b;
          return {
            prompt: `${a} - ${b}`,
            correctAnswer: String(correct),
            wrongAnswers: [a - (b - 1), a - (b + 1), b - a],
            explanation: `Subtract ${b} from ${a} to get ${correct}.`,
            estimatedSolveTime: randomInt(2, 4),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 1, abstraction: 0.1, notationComplexity: 0.08, visualInterpretation: 0, mistakeLikelihood: 0.16 },
            tags: ["arithmetic", "subtraction", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "clean-order-of-operations",
        weight: 6,
        generate() {
          const a = randomInt(4, 14);
          const b = randomInt(2, 8);
          const c = randomInt(3, 10);
          const correct = a + b * c;
          return {
            prompt: `${a} + ${b} x ${c}`,
            correctAnswer: String(correct),
            wrongAnswers: [(a + b) * c, a + (b + c), correct - c],
            explanation: `Multiply first (${b} x ${c}), then add ${a}.`,
            estimatedSolveTime: randomInt(5, 7),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 2, abstraction: 0.28, notationComplexity: 0.28, visualInterpretation: 0, mistakeLikelihood: 0.36 },
            tags: ["arithmetic", "order-of-operations", "medium"],
          };
        },
      },
      {
        subtype: "exact-division-then-add",
        weight: 4,
        generate() {
          const divisor = pick([2, 3, 4, 5, 6, 8]);
          const quotient = randomInt(4, 18);
          const dividend = quotient * divisor;
          const c = randomInt(3, 14);
          const correct = quotient + c;
          return {
            prompt: `${dividend} / ${divisor} + ${c}`,
            correctAnswer: String(correct),
            wrongAnswers: [dividend / (divisor + c), quotient - c, dividend + c],
            explanation: `Compute division first (${dividend}/${divisor}=${quotient}), then add ${c}.`,
            estimatedSolveTime: randomInt(6, 8),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 2, abstraction: 0.32, notationComplexity: 0.34, visualInterpretation: 0, mistakeLikelihood: 0.38 },
            tags: ["arithmetic", "division", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "bracketed-mix",
        weight: 6,
        generate() {
          const a = randomInt(8, 20);
          const b = randomInt(5, 16);
          const c = randomInt(2, 7);
          const d = randomInt(4, 15);
          const correct = (a + b) * c - d;
          return {
            prompt: `(${a} + ${b}) x ${c} - ${d}`,
            correctAnswer: String(correct),
            wrongAnswers: [a + b * c - d, (a + b) * (c - d), (a + b) * c + d],
            explanation: `Evaluate brackets, multiply, then subtract ${d}.`,
            estimatedSolveTime: randomInt(9, 12),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 3, abstraction: 0.54, notationComplexity: 0.56, visualInterpretation: 0, mistakeLikelihood: 0.62 },
            tags: ["arithmetic", "brackets", "hard"],
          };
        },
      },
      {
        subtype: "exact-nested-division",
        weight: 4,
        generate() {
          const d = pick([2, 3, 4, 5, 6]);
          const e = pick([2, 3, 4, 5]);
          const q = randomInt(6, 18);
          const base = q * d;
          const plus = randomInt(4, 18);
          const numerator = (base + plus) * e;
          const correct = (numerator / e - plus) / d;
          return {
            prompt: `(${numerator} / ${e} - ${plus}) / ${d}`,
            correctAnswer: String(correct),
            wrongAnswers: [numerator / e - plus / d, numerator / (e - plus), q + 1],
            explanation: `Work inside out: divide, subtract, then divide again.`,
            estimatedSolveTime: randomInt(10, 14),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 4, abstraction: 0.66, notationComplexity: 0.62, visualInterpretation: 0, mistakeLikelihood: 0.72 },
            tags: ["arithmetic", "nested", "hard"],
          };
        },
      },
    ],
  };
}

function algebraGenerators() {
  return {
    easy: [
      {
        subtype: "solve-one-step-add-sub",
        weight: 6,
        generate() {
          const x = randomInt(-8, 14);
          const k = randomInt(2, 12);
          const isPlus = Math.random() < 0.5;
          const rhs = isPlus ? x + k : x - k;
          const expression = isPlus ? `x + ${k} = ${rhs}` : `x - ${k} = ${rhs}`;
          return {
            prompt: `Solve for x: ${expression}`,
            correctAnswer: String(x),
            wrongAnswers: [String(rhs), String(-x), String(x + (isPlus ? k : -k))],
            explanation: `Isolate x with the inverse operation.`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 1, abstraction: 0.18, notationComplexity: 0.18, visualInterpretation: 0, mistakeLikelihood: 0.24 },
            tags: ["algebra", "one-step", "easy"],
          };
        },
      },
      {
        subtype: "solve-one-step-multiply",
        weight: 4,
        generate() {
          const x = randomInt(-9, 12);
          const a = pick([2, 3, 4, 5, 6]);
          const rhs = a * x;
          const expression = `${a}x = ${rhs}`;
          return {
            prompt: `Solve for x: ${expression}`,
            correctAnswer: String(x),
            wrongAnswers: [String(rhs), String(rhs + a), String(-x)],
            explanation: `Divide both sides by ${a}.`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 1, abstraction: 0.2, notationComplexity: 0.2, visualInterpretation: 0, mistakeLikelihood: 0.22 },
            tags: ["algebra", "one-step", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "solve-two-step-linear",
        weight: 7,
        generate() {
          const x = randomInt(-9, 12);
          const a = pick([2, 3, 4, 5, 6]);
          const b = randomInt(-12, 12);
          const c = a * x + b;
          const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
          const expression = `${a}x ${bText} = ${c}`;
          return {
            prompt: `Solve for x: ${expression}`,
            correctAnswer: String(x),
            wrongAnswers: [String(c - b), String((c + b) / a), String(-x)],
            explanation: `Undo the constant term, then divide by ${a}.`,
            estimatedSolveTime: randomInt(6, 8),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.36, visualInterpretation: 0, mistakeLikelihood: 0.46 },
            tags: ["algebra", "two-step", "medium"],
          };
        },
      },
      {
        subtype: "evaluate-linear-substitution",
        weight: 3,
        generate() {
          const a = randomInt(2, 8);
          const b = randomInt(-10, 10);
          const x = randomInt(-6, 7);
          const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
          const expression = `${a}x ${bText}`;
          const correct = a * x + b;
          return {
            prompt: `Evaluate when x = ${x}: ${expression}`,
            correctAnswer: String(correct),
            wrongAnswers: [String(a + x + b), String(a * (x + b)), String(correct + a)],
            explanation: `Substitute x=${x} and simplify carefully.`,
            estimatedSolveTime: randomInt(5, 7),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 2, abstraction: 0.38, notationComplexity: 0.32, visualInterpretation: 0, mistakeLikelihood: 0.4 },
            tags: ["algebra", "substitution", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "solve-both-sides-linear",
        weight: 6,
        generate() {
          const x = randomInt(-8, 11);
          const a = pick([3, 4, 5, 6]);
          const c = pick([1, 2, 3]);
          if (a === c) return this.generate();
          const b = randomInt(-14, 14);
          const d = a * x + b - c * x;
          const bText = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
          const dText = d >= 0 ? `+ ${d}` : `- ${Math.abs(d)}`;
          const expression = `${a}x ${bText} = ${c}x ${dText}`;
          return {
            prompt: `Solve for x: ${expression}`,
            correctAnswer: String(x),
            wrongAnswers: [String(d - b), String((d + b) / (a - c)), String(-x)],
            explanation: `Collect x terms on one side and constants on the other.`,
            estimatedSolveTime: randomInt(9, 13),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 3, abstraction: 0.64, notationComplexity: 0.58, visualInterpretation: 0, mistakeLikelihood: 0.68 },
            tags: ["algebra", "both-sides", "hard"],
          };
        },
      },
      {
        subtype: "solve-bracket-linear",
        weight: 4,
        generate() {
          const x = randomInt(-8, 9);
          const a = pick([2, 3, 4, 5]);
          const k = randomInt(-8, 8);
          const c = pick([1, 2, 3, 4]);
          const rhsConst = a * (x + k) - c * x;
          const kText = k >= 0 ? `+ ${k}` : `- ${Math.abs(k)}`;
          const rhsText = rhsConst >= 0 ? `+ ${rhsConst}` : `- ${Math.abs(rhsConst)}`;
          const expression = `${a}(x ${kText}) = ${c}x ${rhsText}`;
          return {
            prompt: `Solve for x: ${expression}`,
            correctAnswer: String(x),
            wrongAnswers: [String(rhsConst), String(x + k), String(-x)],
            explanation: `Expand the bracket or balance terms strategically.`,
            estimatedSolveTime: randomInt(10, 14),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression },
            cognitive: { steps: 4, abstraction: 0.72, notationComplexity: 0.68, visualInterpretation: 0, mistakeLikelihood: 0.74 },
            tags: ["algebra", "brackets", "hard"],
          };
        },
      },
    ],
  };
}

function fractionsGenerators() {
  return {
    easy: [
      {
        subtype: "add-like-denominator",
        weight: 6,
        generate() {
          const d = pick([2, 3, 4, 5, 6, 8, 10, 12]);
          const a = randomInt(1, d - 1);
          const b = randomInt(1, d - 1);
          const sum = simplifyFraction(a + b, d);
          return {
            prompt: `${a}/${d} + ${b}/${d}`,
            correctAnswer: formatFraction(sum.n, sum.d),
            wrongAnswers: buildFractionDistractors(sum, [formatFraction(a + b, d), formatFraction(a + b, d + 1)]),
            explanation: `Same denominator: add numerators and simplify.`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "latex",
            answerType: "fraction",
            acceptedAnswers: [String(sum.n / sum.d)],
            diagramSpec: { kind: "fraction-bars", denominator: d, numerators: [a, b], operation: "+" },
            visualType: "fraction_bar",
            cognitive: { steps: 1, abstraction: 0.18, notationComplexity: 0.24, visualInterpretation: 0.22, mistakeLikelihood: 0.26 },
            tags: ["fractions", "add", "easy"],
          };
        },
      },
      {
        subtype: "fraction-of-whole",
        weight: 4,
        generate() {
          const d = pick([2, 3, 4, 5, 6, 8, 10]);
          const n = randomInt(1, Math.min(d - 1, 4));
          const unit = randomInt(2, 10);
          const whole = d * unit;
          const correct = n * unit;
          return {
            prompt: `Find ${n}/${d} of ${whole}`,
            correctAnswer: String(correct),
            wrongAnswers: [String(whole / n), String(d * n), String(correct + unit)],
            explanation: `${whole} divided by ${d} is ${unit}; multiply by ${n}.`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "diagram",
            answerType: "int",
            diagramSpec: { kind: "fraction-of-number", numerator: n, denominator: d, whole },
            cognitive: { steps: 1, abstraction: 0.22, notationComplexity: 0.22, visualInterpretation: 0.26, mistakeLikelihood: 0.28 },
            tags: ["fractions", "of-number", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "add-unlike-denominator",
        weight: 6,
        generate() {
          const d1 = pick([3, 4, 5, 6, 8]);
          const d2 = pick([4, 5, 6, 8, 10]);
          const a = randomInt(1, d1 - 1);
          const b = randomInt(1, d2 - 1);
          const common = lcm(d1, d2);
          const n = a * (common / d1) + b * (common / d2);
          const out = simplifyFraction(n, common);
          return {
            prompt: `${a}/${d1} + ${b}/${d2}`,
            correctAnswer: formatFraction(out.n, out.d),
            wrongAnswers: buildFractionDistractors(out, [formatFraction(a + b, common), formatFraction(a + b, d1 + d2)]),
            explanation: `Use a common denominator (${common}), then simplify.`,
            estimatedSolveTime: randomInt(6, 8),
            renderMode: "latex",
            answerType: "fraction",
            acceptedAnswers: [String(out.n / out.d)],
            cognitive: { steps: 2, abstraction: 0.4, notationComplexity: 0.48, visualInterpretation: 0.12, mistakeLikelihood: 0.48 },
            tags: ["fractions", "unlike-denominator", "medium"],
          };
        },
      },
      {
        subtype: "fraction-multiply",
        weight: 4,
        generate() {
          const a = randomInt(1, 9);
          const b = randomInt(2, 12);
          const c = randomInt(1, 9);
          const d = randomInt(2, 12);
          const out = simplifyFraction(a * c, b * d);
          return {
            prompt: `${a}/${b} x ${c}/${d}`,
            correctAnswer: formatFraction(out.n, out.d),
            wrongAnswers: buildFractionDistractors(out, [formatFraction(a + c, b + d), formatFraction(a * d, b * c)]),
            explanation: `Multiply numerators and denominators, then simplify.`,
            estimatedSolveTime: randomInt(5, 8),
            renderMode: "latex",
            answerType: "fraction",
            acceptedAnswers: [String(out.n / out.d)],
            cognitive: { steps: 2, abstraction: 0.44, notationComplexity: 0.44, visualInterpretation: 0.08, mistakeLikelihood: 0.46 },
            tags: ["fractions", "multiply", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "fraction-division",
        weight: 6,
        generate() {
          const a = randomInt(1, 11);
          const b = randomInt(2, 14);
          const c = randomInt(1, 11);
          const d = randomInt(2, 14);
          const out = simplifyFraction(a * d, b * c);
          return {
            prompt: `${a}/${b} / ${c}/${d}`,
            correctAnswer: formatFraction(out.n, out.d),
            wrongAnswers: buildFractionDistractors(out, [formatFraction(a * c, b * d), formatFraction(a + d, b + c)]),
            explanation: `Invert the second fraction, multiply, then simplify.`,
            estimatedSolveTime: randomInt(9, 13),
            renderMode: "latex",
            answerType: "fraction",
            acceptedAnswers: [String(out.n / out.d)],
            cognitive: { steps: 3, abstraction: 0.64, notationComplexity: 0.66, visualInterpretation: 0.06, mistakeLikelihood: 0.72 },
            tags: ["fractions", "divide", "hard"],
          };
        },
      },
      {
        subtype: "fraction-mix-two-step",
        weight: 4,
        generate() {
          const a = randomInt(1, 9);
          const b = randomInt(2, 12);
          const c = randomInt(1, 9);
          const d = randomInt(2, 12);
          const e = randomInt(1, 6);
          const common = lcm(b, d);
          const sumN = a * (common / b) + c * (common / d);
          const sum = simplifyFraction(sumN, common);
          const out = simplifyFraction(sum.n * e, sum.d);
          return {
            prompt: `(${a}/${b} + ${c}/${d}) x ${e}`,
            correctAnswer: formatFraction(out.n, out.d),
            wrongAnswers: buildFractionDistractors(out, [formatFraction(sum.n + e, sum.d), formatFraction(sum.n * e, sum.d + 1)]),
            explanation: `Add the fractions first, then multiply by ${e}.`,
            estimatedSolveTime: randomInt(10, 14),
            renderMode: "latex",
            answerType: "fraction",
            acceptedAnswers: [String(out.n / out.d)],
            cognitive: { steps: 4, abstraction: 0.72, notationComplexity: 0.74, visualInterpretation: 0.08, mistakeLikelihood: 0.78 },
            tags: ["fractions", "mixed", "hard"],
          };
        },
      },
    ],
  };
}

function percentagesGenerators() {
  return {
    easy: [
      {
        subtype: "benchmark-percent-of-number",
        weight: 7,
        generate() {
          const percent = pick([10, 20, 25, 50]);
          const baseUnit = randomInt(2, 18);
          const base = percent === 25 ? baseUnit * 4 : percent === 20 ? baseUnit * 5 : percent === 50 ? baseUnit * 2 : baseUnit * 10;
          const correct = (percent / 100) * base;
          return {
            prompt: `${percent}% of ${base}`,
            correctAnswer: String(correct),
            wrongAnswers: [String(base - correct), String(correct + baseUnit), String((percent + 5) / 100 * base)],
            explanation: `Use benchmark percentages for quick mental math.`,
            estimatedSolveTime: randomInt(2, 5),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 1, abstraction: 0.16, notationComplexity: 0.18, visualInterpretation: 0, mistakeLikelihood: 0.24 },
            tags: ["percentages", "benchmark", "easy"],
          };
        },
      },
      {
        subtype: "fraction-to-percent",
        weight: 3,
        generate() {
          const fraction = pick([
            { n: 1, d: 2, p: 50 },
            { n: 1, d: 4, p: 25 },
            { n: 3, d: 4, p: 75 },
            { n: 1, d: 5, p: 20 },
            { n: 2, d: 5, p: 40 },
          ]);
          return {
            prompt: `Convert ${fraction.n}/${fraction.d} to a percent`,
            correctAnswer: String(fraction.p),
            wrongAnswers: [String(fraction.n * 10), String(100 - fraction.p), String(fraction.p + 5)],
            explanation: `Multiply the fraction by 100%.`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "latex",
            answerType: "percent",
            unit: "%",
            cognitive: { steps: 1, abstraction: 0.2, notationComplexity: 0.22, visualInterpretation: 0, mistakeLikelihood: 0.26 },
            tags: ["percentages", "conversion", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "percent-change",
        weight: 6,
        generate() {
          const start = randomInt(40, 240);
          const percent = pick([10, 12, 15, 20, 25, 30]);
          const increase = Math.random() < 0.5;
          const delta = (start * percent) / 100;
          if (!Number.isInteger(delta)) return this.generate();
          const correct = increase ? start + delta : start - delta;
          return {
            prompt: `${start} ${increase ? "increased" : "decreased"} by ${percent}% gives ?`,
            correctAnswer: String(correct),
            wrongAnswers: [String(start + percent), String(start - percent), String(delta)],
            explanation: `Find ${percent}% of ${start}, then ${increase ? "add" : "subtract"} it.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 2, abstraction: 0.44, notationComplexity: 0.34, visualInterpretation: 0, mistakeLikelihood: 0.5 },
            tags: ["percentages", "change", "medium"],
          };
        },
      },
      {
        subtype: "non-benchmark-percent-of-number",
        weight: 4,
        generate() {
          const percent = pick([12, 15, 18, 24, 35, 40]);
          const base = randomInt(25, 320);
          const result = (percent / 100) * base;
          if (!Number.isInteger(result)) return this.generate();
          return {
            prompt: `${percent}% of ${base}`,
            correctAnswer: String(result),
            wrongAnswers: [String(base - result), String((percent + 1) / 100 * base), String(result + percent)],
            explanation: `Convert ${percent}% to a fraction/decimal, then multiply by ${base}.`,
            estimatedSolveTime: randomInt(6, 8),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 2, abstraction: 0.46, notationComplexity: 0.36, visualInterpretation: 0, mistakeLikelihood: 0.46 },
            tags: ["percentages", "of-number", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "reverse-percent-increase",
        weight: 6,
        generate() {
          const original = randomInt(60, 500);
          const percent = pick([10, 20, 25, 40, 50]);
          const final = original * (1 + percent / 100);
          if (!Number.isInteger(final)) return this.generate();
          return {
            prompt: `After a ${percent}% increase, a value is ${final}. Find the original value.`,
            correctAnswer: String(original),
            wrongAnswers: [String(final - percent), String(final / 2), String(final - original)],
            explanation: `Original x (1 + ${percent}/100) = ${final}; divide by the multiplier.`,
            estimatedSolveTime: randomInt(9, 14),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 3, abstraction: 0.68, notationComplexity: 0.56, visualInterpretation: 0, mistakeLikelihood: 0.74 },
            tags: ["percentages", "reverse", "hard"],
          };
        },
      },
      {
        subtype: "reverse-percent-decrease",
        weight: 4,
        generate() {
          const original = randomInt(70, 520);
          const percent = pick([10, 15, 20, 25, 30]);
          const final = original * (1 - percent / 100);
          if (!Number.isInteger(final)) return this.generate();
          return {
            prompt: `After a ${percent}% decrease, a value is ${final}. Find the original value.`,
            correctAnswer: String(original),
            wrongAnswers: [String(final + percent), String(final / (1 + percent / 100)), String(final - percent)],
            explanation: `Final = Original x (1 - ${percent}/100). Rearrange by dividing.`,
            estimatedSolveTime: randomInt(10, 15),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 4, abstraction: 0.74, notationComplexity: 0.58, visualInterpretation: 0, mistakeLikelihood: 0.78 },
            tags: ["percentages", "reverse", "hard"],
          };
        },
      },
    ],
  };
}

function ratioGenerators() {
  return {
    easy: [
      {
        subtype: "simplify-ratio",
        weight: 6,
        generate() {
          const g = pick([2, 3, 4, 5, 6]);
          const a0 = randomInt(1, 8);
          const b0 = randomInt(1, 8);
          const a = a0 * g;
          const b = b0 * g;
          return {
            prompt: `Simplify ratio ${a}:${b}`,
            correctAnswer: `${a0}:${b0}`,
            wrongAnswers: [`${a / 2}:${b / 2}`, `${a0 + 1}:${b0}`, `${a}:${b}`],
            explanation: `Divide both parts by their greatest common factor (${g}).`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "plain_text",
            answerType: "text",
            inputMode: "text",
            cognitive: { steps: 1, abstraction: 0.24, notationComplexity: 0.18, visualInterpretation: 0, mistakeLikelihood: 0.28 },
            tags: ["ratios", "simplify", "easy"],
          };
        },
      },
      {
        subtype: "scale-ratio-missing",
        weight: 4,
        generate() {
          const a = randomInt(1, 10);
          const b = randomInt(1, 10);
          const k = randomInt(2, 8);
          return {
            prompt: `${a}:${b} = ${a * k}:?`,
            correctAnswer: String(b * k),
            wrongAnswers: [String(a * k), String(b + k), String(b * (k - 1))],
            explanation: `Equivalent ratios scale both parts by the same factor (${k}).`,
            estimatedSolveTime: randomInt(3, 5),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 1, abstraction: 0.22, notationComplexity: 0.2, visualInterpretation: 0, mistakeLikelihood: 0.3 },
            tags: ["ratios", "equivalent", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "divide-in-ratio-total",
        weight: 7,
        generate() {
          const a = randomInt(1, 7);
          const b = randomInt(1, 7);
          const unit = randomInt(4, 20);
          const total = (a + b) * unit;
          const partA = a * unit;
          return {
            prompt: `Divide ${total} in the ratio ${a}:${b}. Find the first part.`,
            correctAnswer: String(partA),
            wrongAnswers: [String(total / a), String(total / (a + b)), String(b * unit)],
            explanation: `Total units = ${a + b}. One unit is ${unit}; first part is ${a} units.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 2, abstraction: 0.46, notationComplexity: 0.32, visualInterpretation: 0, mistakeLikelihood: 0.5 },
            tags: ["ratios", "divide", "medium"],
          };
        },
      },
      {
        subtype: "ratio-with-visual-dots",
        weight: 3,
        generate() {
          const red = randomInt(3, 8);
          const blue = randomInt(3, 8);
          const askRed = Math.random() < 0.5;
          const answer = askRed ? red : blue;
          return {
            prompt: `Using the dots shown, what is the ${askRed ? "red" : "blue"} part in ratio form red:blue?`,
            correctAnswer: String(answer),
            wrongAnswers: [String(red + blue), String(Math.abs(red - blue)), String(answer + 1)],
            explanation: `Count the colored groups carefully before forming the ratio.`,
            estimatedSolveTime: randomInt(6, 8),
            renderMode: "diagram",
            answerType: "int",
            diagramSpec: { kind: "ratio-dots", red, blue, ask: askRed ? "red" : "blue" },
            cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.28, visualInterpretation: 0.46, mistakeLikelihood: 0.52 },
            tags: ["ratios", "visual", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "ratio-with-difference",
        weight: 6,
        generate() {
          const a = randomInt(2, 9);
          const b = randomInt(2, 9);
          if (a === b) return this.generate();
          const unit = randomInt(3, 16);
          const diff = Math.abs(a - b) * unit;
          const askFirst = Math.random() < 0.5;
          const answer = askFirst ? a * unit : b * unit;
          return {
            prompt: `Two quantities are in ratio ${a}:${b}. Their difference is ${diff}. Find the ${askFirst ? "first" : "second"} quantity.`,
            correctAnswer: String(answer),
            wrongAnswers: [String(diff), String((a + b) * unit), String(answer + unit)],
            explanation: `Difference corresponds to |${a}-${b}| units, so each unit is ${unit}.`,
            estimatedSolveTime: randomInt(9, 14),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 3, abstraction: 0.66, notationComplexity: 0.42, visualInterpretation: 0, mistakeLikelihood: 0.72 },
            tags: ["ratios", "difference", "hard"],
          };
        },
      },
      {
        subtype: "ratio-reverse-from-part",
        weight: 4,
        generate() {
          const a = randomInt(2, 8);
          const b = randomInt(2, 8);
          const unit = randomInt(4, 15);
          const knownPart = Math.random() < 0.5 ? a * unit : b * unit;
          const knownName = knownPart === a * unit ? "first" : "second";
          const askTotal = Math.random() < 0.7;
          const total = (a + b) * unit;
          const answer = askTotal ? total : (knownPart === a * unit ? b * unit : a * unit);
          return {
            prompt: `In ratio ${a}:${b}, the ${knownName} part is ${knownPart}. Find the ${askTotal ? "total" : "other"} value.`,
            correctAnswer: String(answer),
            wrongAnswers: [String(knownPart + unit), String(total - knownPart), String((a + b) + knownPart)],
            explanation: `Find unit size from the known part, then scale to requested quantity.`,
            estimatedSolveTime: randomInt(10, 15),
            renderMode: "plain_text",
            answerType: "int",
            cognitive: { steps: 4, abstraction: 0.74, notationComplexity: 0.44, visualInterpretation: 0, mistakeLikelihood: 0.78 },
            tags: ["ratios", "reverse", "hard"],
          };
        },
      },
    ],
  };
}

function geometryGenerators() {
  return {
    easy: [
      {
        subtype: "rectangle-perimeter",
        weight: 6,
        generate() {
          const w = randomInt(3, 16);
          const h = randomInt(3, 16);
          const correct = 2 * (w + h);
          return {
            prompt: `Find the perimeter of the rectangle.`,
            correctAnswer: String(correct),
            wrongAnswers: [String(w * h), String(w + h), String(2 * w + h)],
            explanation: `Perimeter = 2(w + h) = 2(${w} + ${h}) = ${correct}.`,
            estimatedSolveTime: randomInt(4, 6),
            renderMode: "diagram",
            answerType: "int",
            diagramSpec: { kind: "rectangle", width: w, height: h },
            unit: "units",
            cognitive: { steps: 1, abstraction: 0.22, notationComplexity: 0.24, visualInterpretation: 0.36, mistakeLikelihood: 0.3 },
            tags: ["geometry", "perimeter", "easy"],
          };
        },
      },
      {
        subtype: "triangle-missing-angle",
        weight: 4,
        generate() {
          const a = randomInt(25, 85);
          const b = randomInt(20, 75);
          const c = 180 - a - b;
          if (c <= 0) return this.generate();
          return {
            prompt: `Find the missing angle in the triangle.`,
            correctAnswer: String(c),
            wrongAnswers: [String(180 - a), String(180 - b), String(a + b)],
            explanation: `Angles in a triangle sum to 180 degrees.`,
            estimatedSolveTime: randomInt(4, 6),
            renderMode: "diagram",
            answerType: "angle",
            unit: "deg",
            diagramSpec: { kind: "triangle-angle", values: { a, b, c: "?" } },
            cognitive: { steps: 1, abstraction: 0.24, notationComplexity: 0.2, visualInterpretation: 0.4, mistakeLikelihood: 0.34 },
            tags: ["geometry", "angles", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "rectangle-area",
        weight: 6,
        generate() {
          const w = randomInt(5, 18);
          const h = randomInt(4, 14);
          const correct = w * h;
          return {
            prompt: `Find the area of the rectangle shown.`,
            correctAnswer: String(correct),
            wrongAnswers: [String(2 * (w + h)), String(w + h), String(correct + w)],
            explanation: `Rectangle area = width x height.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "diagram",
            answerType: "int",
            unit: "square units",
            diagramSpec: { kind: "rectangle", width: w, height: h },
            cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.34, visualInterpretation: 0.42, mistakeLikelihood: 0.46 },
            tags: ["geometry", "area", "medium", "visual"],
          };
        },
      },
      {
        subtype: "straight-line-angle",
        weight: 4,
        generate() {
          const known = randomInt(35, 145);
          const correct = 180 - known;
          return {
            prompt: `Angles on a straight line are shown. Find the missing angle.`,
            correctAnswer: String(correct),
            wrongAnswers: [String(known), String(90 - known), String(correct + 10)],
            explanation: `A straight-line pair sums to 180 degrees.`,
            estimatedSolveTime: randomInt(5, 8),
            renderMode: "diagram",
            answerType: "angle",
            unit: "deg",
            diagramSpec: { kind: "line-angle", known, unknownLabel: "?" },
            cognitive: { steps: 2, abstraction: 0.4, notationComplexity: 0.28, visualInterpretation: 0.46, mistakeLikelihood: 0.5 },
            tags: ["geometry", "line-angle", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "rectangle-area-from-perimeter",
        weight: 6,
        generate() {
          const w = randomInt(4, 16);
          const h = randomInt(5, 18);
          const perimeter = 2 * (w + h);
          const correct = w * h;
          return {
            prompt: `The rectangle shown has perimeter ${perimeter}. Width is ${w}. Find its area.`,
            correctAnswer: String(correct),
            wrongAnswers: [String(perimeter * w), String(perimeter / 2), String(2 * (w + h))],
            explanation: `From 2(w+h)=${perimeter}, solve h then compute area w x h.`,
            estimatedSolveTime: randomInt(9, 14),
            renderMode: "diagram",
            answerType: "int",
            unit: "square units",
            diagramSpec: { kind: "rectangle", width: w, height: h, labels: { width: String(w), height: "h" } },
            cognitive: { steps: 3, abstraction: 0.64, notationComplexity: 0.5, visualInterpretation: 0.48, mistakeLikelihood: 0.68 },
            tags: ["geometry", "area", "hard", "visual"],
          };
        },
      },
      {
        subtype: "circle-circumference-pi",
        weight: 4,
        generate() {
          const r = randomInt(3, 12);
          const correct = 2 * r;
          return {
            prompt: `A circle has radius ${r}. Give circumference in terms of pi.`,
            correctAnswer: `${correct}pi`,
            wrongAnswers: [`${r}pi`, `${2 * r * r}pi`, `${correct}`],
            explanation: `Circumference C = 2pi r = ${correct}pi.`,
            estimatedSolveTime: randomInt(9, 13),
            renderMode: "diagram",
            answerType: "text",
            inputMode: "text",
            diagramSpec: { kind: "circle", radius: r, showDiameter: false, label: `r=${r}` },
            formatting: { style: "math", expression: `C = 2 pi r` },
            cognitive: { steps: 2, abstraction: 0.62, notationComplexity: 0.66, visualInterpretation: 0.36, mistakeLikelihood: 0.64 },
            acceptedAnswers: [`${correct}π`, `${correct}*pi`],
            tags: ["geometry", "circumference", "hard"],
          };
        },
      },
    ],
  };
}

function graphsFunctionsGenerators() {
  const axisRange = (difficulty) => GRAPH_RANGE_PRESETS[difficulty];
  const range = (difficulty) => {
    const preset = axisRange(difficulty);
    return { xMin: preset.xMin, xMax: preset.xMax, yMin: preset.yMin, yMax: preset.yMax };
  };
  const buildGraphVisual = (difficulty, points = [], lines = [], overrides = {}) => {
    const r = range(difficulty);
    return {
      xMin: r.xMin,
      xMax: r.xMax,
      yMin: r.yMin,
      yMax: r.yMax,
      showGrid: true,
      showAxisNumbers: true,
      showAxisLabels: true,
      points,
      lines,
      ...overrides,
    };
  };
  const asGraphSpec = (visualData) => ({
    kind: "graph-cartesian",
    xRange: [visualData.xMin, visualData.xMax],
    yRange: [visualData.yMin, visualData.yMax],
    showGrid: visualData.showGrid,
    showAxisNumbers: visualData.showAxisNumbers,
    showAxisLabels: visualData.showAxisLabels,
    points: (visualData.points ?? []).map((p) => ({ x: p.x, y: p.y, label: p.label })),
    lines: (visualData.lines ?? []).map((l) => ({ m: l.m, b: l.b, label: l.label })),
  });
  const linearText = (m, b) => {
    const mText = m === 1 ? "x" : m === -1 ? "-x" : `${m}x`;
    if (b === 0) return `y = ${mText}`;
    return `y = ${mText} ${b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`}`;
  };
  const tableRows = (m, b, xs) => xs.map((x) => ({ x, y: m * x + b }));
  const weightedEntries = (difficulty, factories) =>
    Object.entries(GRAPH_SUBTYPE_WEIGHTS[difficulty]).map(([subtype, weight]) => ({
      subtype,
      weight,
      generate: factories[subtype],
    }));

  const easyFactories = {
    read_x_coordinate() {
      const r = range("easy");
      const x = randomInt(r.xMin + 1, r.xMax - 1);
      const y = randomInt(r.yMin + 1, r.yMax - 1);
      const visualData = buildGraphVisual("easy", [{ x, y, label: "P" }], []);
      return {
        prompt: "What is the x-coordinate of point P?",
        correctAnswer: String(x),
        wrongAnswers: [String(y), String(x + 1), String(x - 1)],
        explanation: "Read the horizontal value of point P.",
        estimatedSolveTime: randomInt(2, 4),
        renderMode: "graph",
        answerType: "int",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 1, abstraction: 0.16, notationComplexity: 0.15, visualInterpretation: 0.32, mistakeLikelihood: 0.24 },
        tags: ["graphs_functions", "read_x_coordinate", "easy"],
      };
    },
    read_y_coordinate() {
      const r = range("easy");
      const x = randomInt(r.xMin + 1, r.xMax - 1);
      const y = randomInt(r.yMin + 1, r.yMax - 1);
      const visualData = buildGraphVisual("easy", [{ x, y, label: "A" }], []);
      return {
        prompt: "What is the y-coordinate of point A?",
        correctAnswer: String(y),
        wrongAnswers: [String(x), String(y + 1), String(y - 1)],
        explanation: "Read the vertical value of point A.",
        estimatedSolveTime: randomInt(2, 4),
        renderMode: "graph",
        answerType: "int",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 1, abstraction: 0.16, notationComplexity: 0.15, visualInterpretation: 0.32, mistakeLikelihood: 0.24 },
        tags: ["graphs_functions", "read_y_coordinate", "easy"],
      };
    },
    read_point_coordinate() {
      const r = range("easy");
      const x = randomInt(r.xMin + 1, r.xMax - 1);
      const y = randomInt(r.yMin + 1, r.yMax - 1);
      const visualData = buildGraphVisual("easy", [{ x, y, label: "B" }], []);
      return {
        prompt: "What are the coordinates of point B?",
        correctAnswer: `(${x},${y})`,
        wrongAnswers: [`(${y},${x})`, `(${x + 1},${y})`, `(${x},${y + 1})`],
        explanation: "Coordinate order is (x, y).",
        estimatedSolveTime: randomInt(3, 5),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        acceptedAnswers: [`(${x}, ${y})`, `${x},${y}`, `${x}, ${y}`],
        cognitive: { steps: 1, abstraction: 0.2, notationComplexity: 0.22, visualInterpretation: 0.36, mistakeLikelihood: 0.28 },
        tags: ["graphs_functions", "read_point_coordinate", "easy"],
      };
    },
    read_y_intercept() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-4, 4);
      const visualData = buildGraphVisual("easy", [], [{ type: "linear", m, b, label: "l" }]);
      return {
        prompt: "What is the y-intercept of the line?",
        correctAnswer: String(b),
        wrongAnswers: [String(m), String(-b), String(b + 1)],
        explanation: "The y-intercept is where the line crosses the y-axis.",
        estimatedSolveTime: randomInt(3, 5),
        renderMode: "graph",
        answerType: "int",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 1, abstraction: 0.22, notationComplexity: 0.24, visualInterpretation: 0.4, mistakeLikelihood: 0.3 },
        tags: ["graphs_functions", "read_y_intercept", "easy"],
      };
    },
    evaluate_function() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-6, 6);
      const x = randomInt(-3, 4);
      const y = m * x + b;
      return {
        prompt: `If ${linearText(m, b)}, what is f(${x})?`,
        correctAnswer: String(y),
        wrongAnswers: [String(m + x + b), String(m * (x + b)), String(y + m)],
        explanation: `Substitute x = ${x} into the rule.`,
        estimatedSolveTime: randomInt(3, 5),
        renderMode: "latex",
        answerType: "int",
        formatting: { style: "math", expression: linearText(m, b) },
        cognitive: { steps: 1, abstraction: 0.24, notationComplexity: 0.24, visualInterpretation: 0, mistakeLikelihood: 0.3 },
        tags: ["graphs_functions", "evaluate_function", "easy"],
      };
    },
    read_table() {
      const m = pick([1, 2, 3]);
      const b = randomInt(-2, 4);
      const rows = tableRows(m, b, [0, 1, 2, 3]);
      const ask = pick(rows);
      return {
        prompt: `From the table, what is y when x = ${ask.x}?`,
        correctAnswer: String(ask.y),
        wrongAnswers: [String(ask.x), String(ask.y + 1), String(ask.y - 1)],
        explanation: "Read the y-value from the row with the requested x-value.",
        estimatedSolveTime: randomInt(2, 5),
        renderMode: "table",
        answerType: "int",
        visualData: { ...buildGraphVisual("easy"), tables: rows },
        cognitive: { steps: 1, abstraction: 0.16, notationComplexity: 0.18, visualInterpretation: 0.22, mistakeLikelihood: 0.22 },
        tags: ["graphs_functions", "read_table", "easy"],
      };
    },
  };

  const mediumFactories = {
    read_x_intercept() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const xIntercept = randomInt(-5, 5);
      const b = -m * xIntercept;
      const visualData = buildGraphVisual("medium", [], [{ type: "linear", m, b, label: "l" }]);
      return {
        prompt: "What is the x-intercept of the line?",
        correctAnswer: String(xIntercept),
        wrongAnswers: [String(b), String(-xIntercept), String(xIntercept + 1)],
        explanation: "The x-intercept is where the line crosses the x-axis.",
        estimatedSolveTime: randomInt(5, 8),
        renderMode: "graph",
        answerType: "int",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 2, abstraction: 0.44, notationComplexity: 0.34, visualInterpretation: 0.5, mistakeLikelihood: 0.48 },
        tags: ["graphs_functions", "read_x_intercept", "medium"],
      };
    },
    read_y_intercept() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const b = randomInt(-7, 7);
      const visualData = buildGraphVisual("medium", [], [{ type: "linear", m, b, label: "l" }]);
      return {
        prompt: "What is the y-intercept of the line?",
        correctAnswer: String(b),
        wrongAnswers: [String(m), String(-b), String(b + (b >= 0 ? 1 : -1))],
        explanation: "Read where the line crosses the y-axis.",
        estimatedSolveTime: randomInt(5, 8),
        renderMode: "graph",
        answerType: "int",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.34, visualInterpretation: 0.46, mistakeLikelihood: 0.46 },
        tags: ["graphs_functions", "read_y_intercept", "medium"],
      };
    },
    identify_slope() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const b = randomInt(-4, 4);
      const visualData = buildGraphVisual("medium", [], [{ type: "linear", m, b, label: "l" }]);
      return {
        prompt: "What is the slope of the line?",
        correctAnswer: String(m),
        wrongAnswers: [String(1 / m), String(-m), String(m + (m > 0 ? 1 : -1))],
        explanation: "Slope is rise over run. Positive rises right, negative falls right.",
        estimatedSolveTime: randomInt(6, 9),
        renderMode: "graph",
        answerType: "number",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 2, abstraction: 0.5, notationComplexity: 0.42, visualInterpretation: 0.56, mistakeLikelihood: 0.56 },
        tags: ["graphs_functions", "identify_slope", "medium"],
      };
    },
    match_equation() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-5, 5);
      const visualData = buildGraphVisual("medium", [], [{ type: "linear", m, b, label: "l" }]);
      const good = linearText(m, b);
      const wrong1 = linearText(-m, b);
      const wrong2 = linearText(m, -b);
      const wrong3 = linearText(m + (m > 0 ? 1 : -1), b);
      return {
        prompt: "Which equation matches the graph?",
        correctAnswer: good,
        wrongAnswers: [wrong1, wrong2, wrong3],
        explanation: "Match both slope and y-intercept, not just one feature.",
        estimatedSolveTime: randomInt(6, 9),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 2, abstraction: 0.52, notationComplexity: 0.46, visualInterpretation: 0.52, mistakeLikelihood: 0.58 },
        tags: ["graphs_functions", "match_equation", "medium"],
      };
    },
    read_table() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-4, 4);
      const xs = [-2, -1, 0, 1, 2];
      const rows = tableRows(m, b, xs);
      const xAsk = pick([3, -3]);
      const yAsk = m * xAsk + b;
      return {
        prompt: `Using the table pattern, what is y when x = ${xAsk}?`,
        correctAnswer: String(yAsk),
        wrongAnswers: [String(yAsk + 1), String(m + xAsk + b), String(-yAsk)],
        explanation: "Infer the linear pattern from consecutive rows, then evaluate.",
        estimatedSolveTime: randomInt(6, 9),
        renderMode: "table",
        answerType: "int",
        visualData: { ...buildGraphVisual("medium"), tables: rows },
        cognitive: { steps: 2, abstraction: 0.46, notationComplexity: 0.36, visualInterpretation: 0.24, mistakeLikelihood: 0.5 },
        tags: ["graphs_functions", "read_table", "medium"],
      };
    },
    identify_rule_from_table() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-5, 5);
      const rows = tableRows(m, b, [-2, -1, 0, 1]);
      const good = linearText(m, b);
      return {
        prompt: "Which rule matches the table?",
        correctAnswer: good,
        wrongAnswers: [linearText(-m, b), linearText(m, -b), linearText(m + (m > 0 ? 1 : -1), b)],
        explanation: "Use rate of change for slope and y at x=0 for intercept.",
        estimatedSolveTime: randomInt(6, 9),
        renderMode: "table",
        answerType: "text",
        inputMode: "text",
        visualData: { ...buildGraphVisual("medium"), tables: rows },
        cognitive: { steps: 2, abstraction: 0.5, notationComplexity: 0.42, visualInterpretation: 0.3, mistakeLikelihood: 0.54 },
        tags: ["graphs_functions", "identify_rule_from_table", "medium"],
      };
    },
    increasing_decreasing() {
      const m = pick([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
      const b = randomInt(-4, 4);
      const trend = m > 0 ? "increasing" : m < 0 ? "decreasing" : "constant";
      const visualData = buildGraphVisual("medium", [], [{ type: "linear", m, b, label: "l" }]);
      const wrongTrend = ["increasing", "decreasing", "constant"].filter((x) => x !== trend);
      return {
        prompt: "Is the graph increasing, decreasing, or constant?",
        correctAnswer: trend,
        wrongAnswers: [...wrongTrend, "not enough information"],
        explanation: "Positive slope increases, negative slope decreases, zero slope is constant.",
        estimatedSolveTime: randomInt(5, 8),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.3, visualInterpretation: 0.46, mistakeLikelihood: 0.44 },
        tags: ["graphs_functions", "increasing_decreasing", "medium"],
      };
    },
    evaluate_function() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const b = randomInt(-6, 6);
      const x = randomInt(-5, 5);
      const y = m * x + b;
      return {
        prompt: `If ${linearText(m, b)}, what is f(${x})?`,
        correctAnswer: String(y),
        wrongAnswers: [String(y + 1), String(m + x + b), String(-y)],
        explanation: "Substitute x and simplify in order.",
        estimatedSolveTime: randomInt(5, 8),
        renderMode: "latex",
        answerType: "int",
        formatting: { style: "math", expression: linearText(m, b) },
        cognitive: { steps: 2, abstraction: 0.42, notationComplexity: 0.34, visualInterpretation: 0, mistakeLikelihood: 0.44 },
        tags: ["graphs_functions", "evaluate_function", "medium"],
      };
    },
  };

  const hardFactories = {
    match_equation() {
      const m = pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
      const b = randomInt(-8, 8);
      const visualData = buildGraphVisual("hard", [], [{ type: "linear", m, b, label: "g" }]);
      const good = linearText(m, b);
      return {
        prompt: "Which equation matches this graph?",
        correctAnswer: good,
        wrongAnswers: [linearText(-m, b), linearText(m, -b), linearText(m + (m > 0 ? 2 : -2), b)],
        explanation: "Both slope and intercept must match exactly.",
        estimatedSolveTime: randomInt(9, 14),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 3, abstraction: 0.72, notationComplexity: 0.64, visualInterpretation: 0.58, mistakeLikelihood: 0.72 },
        tags: ["graphs_functions", "match_equation", "hard"],
      };
    },
    identify_slope() {
      const m = pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
      const b = randomInt(-8, 8);
      const visualData = buildGraphVisual("hard", [], [{ type: "linear", m, b, label: "g" }]);
      return {
        prompt: "What is the slope of the graph?",
        correctAnswer: String(m),
        wrongAnswers: [String(1 / m), String(-m), String(m + (m > 0 ? 1 : -1))],
        explanation: "Use two clear lattice points and compute rise/run.",
        estimatedSolveTime: randomInt(8, 13),
        renderMode: "graph",
        answerType: "number",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 3, abstraction: 0.68, notationComplexity: 0.56, visualInterpretation: 0.62, mistakeLikelihood: 0.7 },
        tags: ["graphs_functions", "identify_slope", "hard"],
      };
    },
    compare_graphs() {
      const m1 = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      let m2 = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      if (m2 === m1) m2 = m1 > 0 ? m1 - 1 : m1 + 1;
      const b1 = randomInt(-4, 4);
      const b2 = randomInt(-4, 4);
      const steeper = Math.abs(m1) > Math.abs(m2) ? "Line A" : "Line B";
      const visualData = buildGraphVisual(
        "hard",
        [],
        [
          { type: "linear", m: m1, b: b1, label: "A" },
          { type: "linear", m: m2, b: b2, label: "B" },
        ],
      );
      return {
        prompt: "Which line is steeper?",
        correctAnswer: steeper,
        wrongAnswers: [steeper === "Line A" ? "Line B" : "Line A", "Same steepness", "Cannot determine"],
        explanation: "Steeper means larger absolute slope.",
        estimatedSolveTime: randomInt(9, 14),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 3, abstraction: 0.72, notationComplexity: 0.5, visualInterpretation: 0.66, mistakeLikelihood: 0.72 },
        tags: ["graphs_functions", "compare_graphs", "hard"],
      };
    },
    transformation() {
      const m = pick([-3, -2, -1, 1, 2, 3]);
      const b = randomInt(-3, 3);
      const shift = pick([-3, -2, -1, 1, 2, 3]);
      const visualData = buildGraphVisual(
        "hard",
        [],
        [
          { type: "linear", m, b, label: "f" },
          { type: "linear", m, b: b + shift, label: "g" },
        ]
      );
      const direction = shift > 0 ? "up" : "down";
      return {
        prompt: "Compared to line f, how is line g transformed?",
        correctAnswer: `${Math.abs(shift)} ${direction}`,
        wrongAnswers: [`${Math.abs(shift)} ${direction === "up" ? "down" : "up"}`, `${Math.abs(shift)} right`, `${Math.abs(shift)} left`],
        explanation: "Same slope means vertical shift only; intercept difference gives shift amount.",
        estimatedSolveTime: randomInt(10, 15),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 4, abstraction: 0.8, notationComplexity: 0.62, visualInterpretation: 0.66, mistakeLikelihood: 0.8 },
        tags: ["graphs_functions", "transformation", "hard"],
      };
    },
    identify_rule_from_table() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const b = randomInt(-8, 8);
      const rows = tableRows(m, b, [-2, -1, 0, 1, 2]);
      const good = linearText(m, b);
      return {
        prompt: "Which linear rule matches the table?",
        correctAnswer: good,
        wrongAnswers: [linearText(-m, b), linearText(m, -b), linearText(m + (m > 0 ? 1 : -1), b)],
        explanation: "Use constant change in y for slope and row x=0 for intercept.",
        estimatedSolveTime: randomInt(9, 14),
        renderMode: "table",
        answerType: "text",
        inputMode: "text",
        visualData: { ...buildGraphVisual("hard"), tables: rows },
        cognitive: { steps: 3, abstraction: 0.72, notationComplexity: 0.56, visualInterpretation: 0.4, mistakeLikelihood: 0.74 },
        tags: ["graphs_functions", "identify_rule_from_table", "hard"],
      };
    },
    increasing_decreasing() {
      const m = pick([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
      const b = randomInt(-6, 6);
      const trend = m > 0 ? "increasing" : m < 0 ? "decreasing" : "constant";
      const visualData = buildGraphVisual("hard", [], [{ type: "linear", m, b, label: "h" }]);
      const wrongTrend = ["increasing", "decreasing", "constant"].filter((x) => x !== trend);
      return {
        prompt: "Over the shown interval, is the graph increasing, decreasing, or constant?",
        correctAnswer: trend,
        wrongAnswers: [...wrongTrend, "not enough information"],
        explanation: "Trend is determined by slope sign.",
        estimatedSolveTime: randomInt(8, 12),
        renderMode: "graph",
        answerType: "text",
        inputMode: "text",
        visualData,
        diagramSpec: asGraphSpec(visualData),
        cognitive: { steps: 3, abstraction: 0.62, notationComplexity: 0.42, visualInterpretation: 0.58, mistakeLikelihood: 0.66 },
        tags: ["graphs_functions", "increasing_decreasing", "hard"],
      };
    },
    infer_rule_then_evaluate() {
      const m = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const b = randomInt(-6, 6);
      const rows = tableRows(m, b, [-1, 0, 1, 2]);
      const xAsk = pick([-3, 3, 4]);
      const correct = m * xAsk + b;
      return {
        prompt: `Infer the rule from the table, then find y when x = ${xAsk}.`,
        correctAnswer: String(correct),
        wrongAnswers: [String(correct + 1), String(m + xAsk + b), String(-correct)],
        explanation: "Find slope/intercept from the table pattern, then evaluate.",
        estimatedSolveTime: randomInt(10, 15),
        renderMode: "table",
        answerType: "int",
        visualData: { ...buildGraphVisual("hard"), tables: rows },
        cognitive: { steps: 4, abstraction: 0.82, notationComplexity: 0.6, visualInterpretation: 0.44, mistakeLikelihood: 0.82 },
        tags: ["graphs_functions", "infer_rule_then_evaluate", "hard"],
      };
    },
  };

  return {
    easy: weightedEntries("easy", easyFactories),
    medium: weightedEntries("medium", mediumFactories),
    hard: weightedEntries("hard", hardFactories),
  };
}

function calculusGenerators() {
  const combineTerms = (terms) => {
    const map = new Map();
    for (const term of terms) {
      const p = term.power;
      map.set(p, (map.get(p) ?? 0) + term.coeff);
    }
    return [...map.entries()]
      .map(([power, coeff]) => ({ coeff, power }))
      .filter((t) => t.coeff !== 0)
      .sort((a, b) => b.power - a.power);
  };

  const formatPolynomial = (terms, spaced = true) => {
    const clean = combineTerms(terms);
    if (clean.length === 0) return "0";

    return clean
      .map((term, idx) => {
        const sign = term.coeff < 0 ? "-" : "+";
        const absCoeff = Math.abs(term.coeff);
        let body = "";
        if (term.power === 0) {
          body = String(absCoeff);
        } else if (term.power === 1) {
          body = absCoeff === 1 ? "x" : `${absCoeff}x`;
        } else {
          body = absCoeff === 1 ? `x^${term.power}` : `${absCoeff}x^${term.power}`;
        }

        if (idx === 0) return sign === "-" ? `-${body}` : body;
        return spaced ? `${sign === "-" ? " - " : " + "}${body}` : `${sign}${body}`;
      })
      .join("");
  };

  const derivativeTerms = (terms) =>
    combineTerms(terms)
      .filter((term) => term.power > 0)
      .map((term) => ({ coeff: term.coeff * term.power, power: term.power - 1 }));

  const evaluateTerms = (terms, x) =>
    combineTerms(terms).reduce((sum, term) => sum + term.coeff * x ** term.power, 0);

  const makeFunction = (terms) => `f(x) = ${formatPolynomial(terms, true)}`;

  const derivativeMistakes = (terms) => {
    const clean = combineTerms(terms);
    const m1 = clean
      .filter((term) => term.power > 0)
      .map((term) => ({ coeff: term.power, power: term.power - 1 }));
    const m2 = clean
      .filter((term) => term.power > 0)
      .map((term) => ({ coeff: term.coeff * term.power, power: term.power }));
    const m3 = clean
      .filter((term) => term.power > 0)
      .map((term) => ({ coeff: term.coeff, power: term.power - 1 }));
    return [formatPolynomial(m1, false), formatPolynomial(m2, false), formatPolynomial(m3, false)];
  };

  const pickNonZero = (values) => {
    const v = pick(values);
    return v === 0 ? 1 : v;
  };

  return {
    easy: [
      {
        subtype: "evaluate-function-value",
        weight: 4,
        generate() {
          const x0 = pick([-3, -2, -1, 1, 2, 3, 4]);
          const terms = [
            { coeff: pickNonZero([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]), power: 1 },
            { coeff: pickNonZero([-8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8]), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(terms, x0);
          const wrongSubSign = evaluateTerms(
            terms.map((term) => (term.power === 0 ? { ...term, coeff: -term.coeff } : term)),
            x0
          );
          const wrongLinearized = combineTerms(terms).reduce((sum, term) => sum + term.coeff * x0, 0);
          return {
            prompt: `If ${fx}, find f(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [
              String(wrongSubSign),
              String(wrongLinearized),
              String(correct + pick([-3, -2, -1, 1, 2, 3])),
              String(correct - pick([4, 5])),
            ],
            explanation: `Substitute x = ${x0} into the function, then simplify.`,
            estimatedSolveTime: randomInt(3, 6),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 1, abstraction: 0.24, notationComplexity: 0.28, visualInterpretation: 0, mistakeLikelihood: 0.26 },
            tags: ["calculus", "evaluate-function", "easy"],
          };
        },
      },
      {
        subtype: "derivative-basic-polynomial",
        weight: 3,
        generate() {
          const m = pickNonZero([-8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8]);
          const b = randomInt(-9, 9);
          const terms = [
            { coeff: m, power: 1 },
            { coeff: b, power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = m;
          return {
            prompt: `If ${fx}, find f'(x).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(b), String(-m), String(m + pick([-2, -1, 1, 2]))],
            explanation: `For f(x)=mx+b, the derivative is the constant slope m.`,
            estimatedSolveTime: randomInt(3, 6),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 1, abstraction: 0.28, notationComplexity: 0.34, visualInterpretation: 0, mistakeLikelihood: 0.3 },
            tags: ["calculus", "derivative-basic", "easy"],
          };
        },
      },
      {
        subtype: "derivative-at-point",
        weight: 3,
        generate() {
          const a = randomInt(2, 7);
          const n = pick([2, 3]);
          const x0 = pick([1, 2, 3, 4]);
          const terms = [{ coeff: a, power: n }];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(derivativeTerms(terms), x0);
          const wrongEvaluateOriginal = evaluateTerms(terms, x0);
          const wrongNoPowerDrop = a * n * x0 ** n;
          const wrongNoCoeff = n * x0 ** (n - 1);
          return {
            prompt: `If ${fx}, find f'(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrongEvaluateOriginal), String(wrongNoPowerDrop), String(wrongNoCoeff)],
            explanation: `Differentiate first, then substitute x = ${x0}.`,
            estimatedSolveTime: randomInt(4, 6),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 1, abstraction: 0.32, notationComplexity: 0.34, visualInterpretation: 0, mistakeLikelihood: 0.34 },
            tags: ["calculus", "derivative-at-point", "easy"],
          };
        },
      },
    ],
    medium: [
      {
        subtype: "derivative-multiterm",
        weight: 4,
        generate() {
          const x0 = pick([-2, -1, 1, 2, 3]);
          const terms = [
            { coeff: pickNonZero([-4, -3, -2, 2, 3, 4]), power: 3 },
            { coeff: randomInt(-5, 5), power: 2 },
            { coeff: pickNonZero([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]), power: 1 },
            { coeff: randomInt(-6, 6), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(derivativeTerms(terms), x0);
          const wrongOriginal = evaluateTerms(terms, x0);
          const wrongNoPowerDrop = combineTerms(terms)
            .filter((t) => t.power > 0)
            .reduce((sum, t) => sum + t.coeff * t.power * x0 ** t.power, 0);
          return {
            prompt: `If ${fx}, find f'(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrongOriginal), String(wrongNoPowerDrop), String(correct + pick([-3, -2, 2, 3]))],
            explanation: `Differentiate each term, then substitute x = ${x0}.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 2, abstraction: 0.52, notationComplexity: 0.5, visualInterpretation: 0, mistakeLikelihood: 0.52 },
            tags: ["calculus", "derivative-multiterm", "medium"],
          };
        },
      },
      {
        subtype: "combine-like-terms-derivative",
        weight: 3,
        generate() {
          const x0 = pick([-2, -1, 1, 2, 3]);
          const terms = [
            { coeff: pick([2, 3, 4]), power: 2 },
            { coeff: pick([2, 3, 4]), power: 2 },
            { coeff: pick([-5, -4, -3, 3, 4, 5]), power: 1 },
            { coeff: pick([-4, -3, -2, 2, 3, 4]), power: 1 },
            { coeff: randomInt(-6, 6), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(derivativeTerms(terms), x0);
          const wrongOriginal = evaluateTerms(terms, x0);
          const wrongNoPowerDrop = combineTerms(terms)
            .filter((t) => t.power > 0)
            .reduce((sum, t) => sum + t.coeff * t.power * x0 ** t.power, 0);
          return {
            prompt: `If ${fx}, find f'(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrongOriginal), String(wrongNoPowerDrop), String(correct + pick([-2, -1, 1, 2]))],
            explanation: `Combine like terms first, then differentiate and substitute x = ${x0}.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 2, abstraction: 0.56, notationComplexity: 0.56, visualInterpretation: 0, mistakeLikelihood: 0.56 },
            tags: ["calculus", "combine-like-terms", "medium"],
          };
        },
      },
      {
        subtype: "derivative-then-evaluate",
        weight: 3,
        generate() {
          const x0 = pick([-3, -2, -1, 1, 2, 3, 4]);
          const terms = [
            { coeff: pickNonZero([-4, -3, -2, 2, 3, 4]), power: 3 },
            { coeff: randomInt(-4, 4), power: 2 },
            { coeff: pickNonZero([-5, -4, -3, -2, 2, 3, 4, 5]), power: 1 },
            { coeff: randomInt(-5, 5), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(derivativeTerms(terms), x0);
          const wrongOriginal = evaluateTerms(terms, x0);
          const wrongNoPowerDrop = combineTerms(terms)
            .filter((t) => t.power > 0)
            .reduce((sum, t) => sum + t.coeff * t.power * x0 ** t.power, 0);
          const wrongOffBy = correct + pick([-3, -2, 2, 3]);
          return {
            prompt: `If ${fx}, find f'(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrongOriginal), String(wrongNoPowerDrop), String(wrongOffBy)],
            explanation: `Differentiate term-by-term, then substitute x = ${x0}.`,
            estimatedSolveTime: randomInt(6, 9),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 2, abstraction: 0.58, notationComplexity: 0.56, visualInterpretation: 0, mistakeLikelihood: 0.58 },
            tags: ["calculus", "derivative-then-evaluate", "medium"],
          };
        },
      },
    ],
    hard: [
      {
        subtype: "high-degree-derivative",
        weight: 4,
        generate() {
          const terms = [
            { coeff: pickNonZero([-3, -2, 2, 3]), power: 5 },
            { coeff: randomInt(-4, 4), power: 4 },
            { coeff: randomInt(-4, 4), power: 3 },
            { coeff: pickNonZero([-5, -4, -3, 3, 4, 5]), power: 1 },
            { coeff: randomInt(-7, 7), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = formatPolynomial(derivativeTerms(terms), false);
          const mistakes = derivativeMistakes(terms);
          return {
            prompt: `If ${fx}, find f'(x).`,
            correctAnswer: correct,
            wrongAnswers: mistakes,
            explanation: `Apply the power rule to each term and simplify.`,
            estimatedSolveTime: randomInt(9, 14),
            renderMode: "latex",
            answerType: "text",
            inputMode: "text",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 3, abstraction: 0.74, notationComplexity: 0.7, visualInterpretation: 0, mistakeLikelihood: 0.72 },
            tags: ["calculus", "high-degree-derivative", "hard"],
          };
        },
      },
      {
        subtype: "derivative-at-point-hard",
        weight: 3,
        generate() {
          const x0 = randomInt(-3, 4);
          const terms = [
            { coeff: pickNonZero([-3, -2, 2, 3]), power: 4 },
            { coeff: randomInt(-4, 4), power: 3 },
            { coeff: pickNonZero([-5, -4, -3, 3, 4, 5]), power: 2 },
            { coeff: randomInt(-5, 5), power: 1 },
            { coeff: randomInt(-6, 6), power: 0 },
          ];
          const fx = makeFunction(terms);
          const correct = evaluateTerms(derivativeTerms(terms), x0);
          const wrongOriginal = evaluateTerms(terms, x0);
          const wrongNoPowerDrop = combineTerms(terms)
            .filter((t) => t.power > 0)
            .reduce((sum, t) => sum + t.coeff * t.power * x0 ** t.power, 0);
          const wrongOffBy = correct + pick([-4, -3, 3, 4]);
          return {
            prompt: `If ${fx}, find f'(${x0}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrongOriginal), String(wrongNoPowerDrop), String(wrongOffBy)],
            explanation: `Compute f'(x) first, then evaluate at x = ${x0}.`,
            estimatedSolveTime: randomInt(10, 15),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 3, abstraction: 0.78, notationComplexity: 0.74, visualInterpretation: 0, mistakeLikelihood: 0.78 },
            tags: ["calculus", "derivative-at-point", "hard"],
          };
        },
      },
      {
        subtype: "derivative-plus-evaluation",
        weight: 3,
        generate() {
          const xDeriv = pick([-2, -1, 1, 2]);
          const xEval = pick([-1, 0, 1, 2]);
          const terms = [
            { coeff: pickNonZero([-3, -2, 2, 3]), power: 4 },
            { coeff: randomInt(-4, 4), power: 2 },
            { coeff: pickNonZero([-5, -4, -3, 3, 4, 5]), power: 1 },
            { coeff: randomInt(-6, 6), power: 0 },
          ];
          const fx = makeFunction(terms);
          const derivAt = evaluateTerms(derivativeTerms(terms), xDeriv);
          const valAt = evaluateTerms(terms, xEval);
          const correct = derivAt + valAt;
          const wrong1 = derivAt - valAt;
          const wrong2 = evaluateTerms(terms, xDeriv) + valAt;
          const wrong3 = correct + pick([-5, -4, 4, 5]);
          return {
            prompt: `If ${fx}, find f'(${xDeriv}) + f(${xEval}).`,
            correctAnswer: String(correct),
            wrongAnswers: [String(wrong1), String(wrong2), String(wrong3)],
            explanation: `Find the derivative value at ${xDeriv}, find function value at ${xEval}, then add.`,
            estimatedSolveTime: randomInt(11, 15),
            renderMode: "latex",
            answerType: "int",
            formatting: { style: "math", expression: fx },
            cognitive: { steps: 4, abstraction: 0.82, notationComplexity: 0.76, visualInterpretation: 0, mistakeLikelihood: 0.82 },
            tags: ["calculus", "derivative-plus-evaluation", "hard"],
          };
        },
      },
    ],
  };
}

const GENERATOR_BANK = {
  arithmetic: arithmeticGenerators(),
  algebra: algebraGenerators(),
  fractions: fractionsGenerators(),
  percentages: percentagesGenerators(),
  ratios: ratioGenerators(),
  geometry: geometryGenerators(),
  graphs_functions: graphsFunctionsGenerators(),
  calculus: calculusGenerators(),
};

function generateQuestion(topic, difficulty, scopeKeyOrOptions = "global", maybeOptions = {}) {
  const context = parseGenerationContext(scopeKeyOrOptions, maybeOptions);
  const scopeKey = context.scopeKey;
  const safeTopic = normalizeTopic(topic);
  const safeDifficulty = normalizeDifficulty(difficulty);
  const rules = getRules(safeTopic, safeDifficulty);
  const families = GENERATOR_BANK[safeTopic]?.[safeDifficulty] ?? GENERATOR_BANK.arithmetic.easy;

  for (let attempt = 0; attempt < GLOBAL_TUNING.retryBudget; attempt += 1) {
    const family = pickSubtypeWithRotation(families, scopeKey, safeTopic, safeDifficulty);
    const draft = family.generate.call(family, { topic: safeTopic, difficulty: safeDifficulty, rules });
    const baseQuestion = buildQuestionObject(safeTopic, safeDifficulty, family.subtype, draft, rules);
    const question = applyQuestionFormat(baseQuestion, safeTopic, safeDifficulty, scopeKey, context);

    if (!validateQuestion(safeTopic, safeDifficulty, question)) {
      continue;
    }

    const qKey = questionKey(question);
    if (isRepeatedQuestion(scopeKey, safeTopic, safeDifficulty, qKey)) {
      continue;
    }

    rememberQuestion(scopeKey, safeTopic, safeDifficulty, qKey);
    rememberFormat(scopeKey, safeTopic, safeDifficulty, question.format ?? QUESTION_FORMATS.MULTIPLE_CHOICE);
    return question;
  }

  const fallback = applyQuestionFormat(
    fallbackQuestion(safeTopic, safeDifficulty),
    safeTopic,
    safeDifficulty,
    scopeKey,
    { ...context, forceFormat: QUESTION_FORMATS.MULTIPLE_CHOICE }
  );
  rememberQuestion(scopeKey, safeTopic, safeDifficulty, questionKey(fallback));
  rememberFormat(scopeKey, safeTopic, safeDifficulty, fallback.format ?? QUESTION_FORMATS.MULTIPLE_CHOICE);
  return fallback;
}

function generateQuestionBatch(topic, difficulty, count = 20, scopeKey = "batch", options = {}) {
  const safeCount = clamp(Math.trunc(count), 1, 500);
  const out = [];
  for (let i = 0; i < safeCount; i += 1) {
    out.push(
      generateQuestion(topic, difficulty, {
        scopeKey,
        roundIndex: Number.isFinite(options.roundIndexStart) ? options.roundIndexStart + i : i,
        roundCategory: typeof options.roundCategory === "string" ? options.roundCategory : null,
        forceFormat: typeof options.forceFormat === "string" ? options.forceFormat : null,
        formatWeights: options.formatWeights,
      })
    );
  }
  return out;
}

function generateRoundQuestionSequence(topic, difficulty, count = 12, scopeKey = "round") {
  return generateQuestionBatch(topic, difficulty, count, scopeKey, { roundIndexStart: 0 });
}

function generateFormatDistributionReport(options = {}) {
  const topics = Array.isArray(options.topics) && options.topics.length > 0 ? options.topics : TOPICS;
  const difficulties =
    Array.isArray(options.difficulties) && options.difficulties.length > 0 ? options.difficulties : DIFFICULTIES;
  const sampleCount = clamp(Math.trunc(options.countPerCombo ?? 120), 20, 1000);
  const report = [];

  for (const topic of topics) {
    for (const difficulty of difficulties) {
      const scope = `format-report:${topic}:${difficulty}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const batch = generateQuestionBatch(topic, difficulty, sampleCount, scope);
      const formatCounts = Object.fromEntries(Object.values(QUESTION_FORMATS).map((f) => [f, 0]));
      for (const q of batch) {
        formatCounts[q.format] = (formatCounts[q.format] ?? 0) + 1;
      }

      const validBaseline = TOPIC_ALLOWED_FORMATS[topic] ?? [QUESTION_FORMATS.MULTIPLE_CHOICE];
      const activeFormats = validBaseline.filter((f) => formatCounts[f] > 0);
      const shares = Object.fromEntries(
        validBaseline.map((f) => [f, Number(((formatCounts[f] ?? 0) / sampleCount).toFixed(4))])
      );
      const activeShares = activeFormats.map((f) => shares[f]);
      const maxShare = activeShares.length > 0 ? Math.max(...activeShares) : 0;
      const minShare = activeShares.length > 0 ? Math.min(...activeShares) : 0;
      const spread = Number((maxShare - minShare).toFixed(4));
      const expectedEven = activeFormats.length > 0 ? 1 / activeFormats.length : 1;
      const imbalanceFlag = spread > Math.max(0.15, expectedEven * 0.8);

      const flags = [];
      if (imbalanceFlag) {
        flags.push(`format_spread_high:${spread}`);
      }

      if (validBaseline.includes(QUESTION_FORMATS.FILL_IN)) {
        const fillShare = shares[QUESTION_FORMATS.FILL_IN] ?? 0;
        if (fillShare < 0.12) flags.push(`fill_in_underrepresented:${fillShare}`);
        if (fillShare > 0.5) flags.push(`fill_in_overrepresented:${fillShare}`);
      }

      report.push({
        topic,
        difficulty,
        sampleCount,
        validBaseline,
        formatCounts,
        shares,
        activeFormats,
        spread,
        flags,
      });
    }
  }

  return report;
}

function getMatchDurationSecondsCompat(topic, difficulty) {
  const safeDifficulty = normalizeDifficulty(typeof difficulty === "string" ? difficulty : topic);
  return getMatchDurationSeconds(safeDifficulty);
}

function firstAnswer(question) {
  if (Array.isArray(question?.acceptedAnswers) && question.acceptedAnswers.length > 0) {
    return String(question.acceptedAnswers[0]);
  }
  return String(question?.correctAnswer ?? question?.answer ?? "");
}

const DIFFICULTY_GAMEPLAY_PROFILE = {
  easy: {
    readingLoad: "low",
    expectedSeconds: DIFFICULTY_PROFILE.easy.expectedSolveSeconds,
    maxSteps: DIFFICULTY_PROFILE.easy.maxSteps,
    pressure: "instant",
  },
  medium: {
    readingLoad: "low-medium",
    expectedSeconds: DIFFICULTY_PROFILE.medium.expectedSolveSeconds,
    maxSteps: DIFFICULTY_PROFILE.medium.maxSteps,
    pressure: "balanced",
  },
  hard: {
    readingLoad: "medium",
    expectedSeconds: DIFFICULTY_PROFILE.hard.expectedSolveSeconds,
    maxSteps: DIFFICULTY_PROFILE.hard.maxSteps,
    pressure: "high",
  },
};

const QUESTION_CURRICULUM = {
  mode: "duel-friendly",
  goals: [
    "clean readability",
    "difficulty by cognitive load",
    "topic-specific templates",
    "format-aware generation",
    "round pacing rotation",
    "strict validator rejection",
  ],
  formats: Object.values(QUESTION_FORMATS),
  roundCategories: [...new Set(ROUND_CATEGORY_SEQUENCE)],
  topics: Object.fromEntries(
    TOPICS.map((topic) => [
      topic,
      {
        easy: GENERATOR_BANK[topic].easy.map((x) => x.subtype),
        medium: GENERATOR_BANK[topic].medium.map((x) => x.subtype),
        hard: GENERATOR_BANK[topic].hard.map((x) => x.subtype),
      },
    ])
  ),
};

module.exports = {
  TOPICS,
  DIFFICULTIES,
  DIFFICULTY_GAMEPLAY_PROFILE,
  QUESTION_CURRICULUM,
  getMatchDurationSeconds: getMatchDurationSecondsCompat,
  getQuestionTimerSeconds,
  generateQuestion,
  generateQuestionBatch,
  generateRoundQuestionSequence,
  generateFormatDistributionReport,
  getRoundCategory,
  validateQuestion,
  validateQuestionShape,
  normalizeAnswer,
  isCorrectAnswer,
  isValidTopic,
  isValidDifficulty,
  firstAnswer,
};
