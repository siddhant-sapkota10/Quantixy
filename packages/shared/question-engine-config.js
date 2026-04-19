/**
 * Central config for question formats, pacing, and topic-specific constraints.
 * Keep tuning here to avoid scattering gameplay constants across generators.
 */

const QUESTION_FORMATS = {
  MULTIPLE_CHOICE: "multiple_choice",
  TRUE_FALSE: "true_false",
  RANK_ORDER: "rank_order",
  FILL_IN: "fill_in",
};

const TOPIC_ALLOWED_FORMATS = {
  arithmetic: [QUESTION_FORMATS.MULTIPLE_CHOICE, QUESTION_FORMATS.TRUE_FALSE, QUESTION_FORMATS.FILL_IN],
  algebra: [QUESTION_FORMATS.MULTIPLE_CHOICE, QUESTION_FORMATS.TRUE_FALSE, QUESTION_FORMATS.FILL_IN],
  fractions: [
    QUESTION_FORMATS.MULTIPLE_CHOICE,
    QUESTION_FORMATS.TRUE_FALSE,
    QUESTION_FORMATS.RANK_ORDER,
    QUESTION_FORMATS.FILL_IN,
  ],
  percentages: [
    QUESTION_FORMATS.MULTIPLE_CHOICE,
    QUESTION_FORMATS.TRUE_FALSE,
    QUESTION_FORMATS.RANK_ORDER,
    QUESTION_FORMATS.FILL_IN,
  ],
  ratios: [
    QUESTION_FORMATS.MULTIPLE_CHOICE,
    QUESTION_FORMATS.TRUE_FALSE,
    QUESTION_FORMATS.RANK_ORDER,
    QUESTION_FORMATS.FILL_IN,
  ],
  geometry: [QUESTION_FORMATS.MULTIPLE_CHOICE, QUESTION_FORMATS.RANK_ORDER, QUESTION_FORMATS.FILL_IN],
  graphs_functions: [
    QUESTION_FORMATS.MULTIPLE_CHOICE,
    QUESTION_FORMATS.TRUE_FALSE,
    QUESTION_FORMATS.RANK_ORDER,
    QUESTION_FORMATS.FILL_IN,
  ],
  calculus: [QUESTION_FORMATS.MULTIPLE_CHOICE, QUESTION_FORMATS.TRUE_FALSE, QUESTION_FORMATS.FILL_IN],
};

const FORMAT_WEIGHTS_BY_DIFFICULTY = {
  // Kept intentionally close so the selector can rotate near-evenly.
  easy: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 1,
    [QUESTION_FORMATS.TRUE_FALSE]: 1,
    [QUESTION_FORMATS.RANK_ORDER]: 1,
    [QUESTION_FORMATS.FILL_IN]: 1,
  },
  medium: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 1,
    [QUESTION_FORMATS.TRUE_FALSE]: 1,
    [QUESTION_FORMATS.RANK_ORDER]: 1,
    [QUESTION_FORMATS.FILL_IN]: 1,
  },
  hard: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 1,
    [QUESTION_FORMATS.TRUE_FALSE]: 1,
    [QUESTION_FORMATS.RANK_ORDER]: 1,
    [QUESTION_FORMATS.FILL_IN]: 1,
  },
};

const ROUND_CATEGORY_SEQUENCE = [
  "normal_round",
  "normal_round",
  "speed_round",
  "normal_round",
  "strategy_round",
  "normal_round",
  "precision_round",
  "normal_round",
];

const ROUND_CATEGORY_FORMAT_BIAS = {
  normal_round: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 1.3,
    [QUESTION_FORMATS.TRUE_FALSE]: 1,
    [QUESTION_FORMATS.RANK_ORDER]: 0.75,
    [QUESTION_FORMATS.FILL_IN]: 0.8,
  },
  speed_round: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 0.85,
    [QUESTION_FORMATS.TRUE_FALSE]: 1.6,
    [QUESTION_FORMATS.RANK_ORDER]: 0.6,
    [QUESTION_FORMATS.FILL_IN]: 0.6,
  },
  strategy_round: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 0.85,
    [QUESTION_FORMATS.TRUE_FALSE]: 0.75,
    [QUESTION_FORMATS.RANK_ORDER]: 1.75,
    [QUESTION_FORMATS.FILL_IN]: 0.65,
  },
  precision_round: {
    [QUESTION_FORMATS.MULTIPLE_CHOICE]: 1.2,
    [QUESTION_FORMATS.TRUE_FALSE]: 0.7,
    [QUESTION_FORMATS.RANK_ORDER]: 0.9,
    [QUESTION_FORMATS.FILL_IN]: 1.25,
  },
};

const FORMAT_VALIDATION = {
  mcqOptionCount: 4,
  rankOrderMaxItems: 4,
  trueFalseOptions: ["True", "False"],
  fillInMaxAnswerLength: 14,
  fillInPromptMaxLength: 110,
  fillInMaxCognitiveStepsByDifficulty: {
    easy: 1,
    medium: 2,
    hard: 3,
  },
  fillInExpressionSafePattern: /^[-+]?(\d+(\.\d+)?)(x(\^\d+)?)?([+-]\d*(x(\^\d+)?)?)*$/,
  // Fill-in should be reserved for safe formats only.
  fillInAllowedAnswerTypes: new Set(["int", "number", "fraction", "percent"]),
  // True/false should not read like a mini word problem.
  trueFalsePromptMaxLength: 120,
  // Rotation policy: avoid long streaks while keeping randomness.
  maxConsecutiveSameFormat: 2,
  recentFormatWindow: 8,
  leastUsedBoost: 2.6,
  recencyPenaltyBase: 0.48,
  hardBlockSameFormatStreak: 3,
};

module.exports = {
  QUESTION_FORMATS,
  TOPIC_ALLOWED_FORMATS,
  FORMAT_WEIGHTS_BY_DIFFICULTY,
  ROUND_CATEGORY_SEQUENCE,
  ROUND_CATEGORY_FORMAT_BIAS,
  FORMAT_VALIDATION,
};
