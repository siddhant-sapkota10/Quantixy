/**
 * Central difficulty + topic framework for duel question generation.
 * Difficulty is modeled by cognitive load, not raw number size.
 */
const { GRAPH_TIMER_SECONDS } = require("./graphs-functions-config");

/** @typedef {"tiny"|"easy"|"medium"|"hard"} Difficulty */
/** @typedef {"arithmetic"|"algebra"|"fractions"|"percentages"|"ratios"|"geometry"|"graphs_functions"|"calculus"} Topic */

const TOPICS = [
  "arithmetic",
  "algebra",
  "fractions",
  "percentages",
  "ratios",
  "geometry",
  "graphs_functions",
  "calculus",
];

const DIFFICULTIES = ["tiny", "easy", "medium", "hard"];

const LEGACY_TOPIC_ALIASES = {
  functions: "graphs_functions",
  graph: "graphs_functions",
  graphs: "graphs_functions",
  graphs_and_functions: "graphs_functions",
  "graphs/functions": "graphs_functions",
  "graphs-functions": "graphs_functions",
  trigonometry: "geometry",
  statistics: "percentages",
  exponents: "algebra",
};

const GLOBAL_TUNING = {
  retryBudget: 120,
  recentSubtypeHistory: 3,
  recentQuestionHistory: 18,
  matchDurationByDifficultySeconds: {
    tiny: 54,
    easy: 60,
    medium: 78,
    hard: 96,
  },
};

const DIFFICULTY_PROFILE = {
  tiny: {
    expectedSolveSeconds: [1, 5],
    maxSteps: 1,
    abstractionBand: [0.05, 0.28],
    notationBand: [0.05, 0.3],
    visualBand: [0.0, 0.42],
    mistakeBand: [0.06, 0.32],
    scoreBand: [0.08, 0.28],
  },
  easy: {
    expectedSolveSeconds: [2, 5],
    maxSteps: 1,
    abstractionBand: [0.05, 0.32],
    notationBand: [0.05, 0.35],
    visualBand: [0.0, 0.45],
    mistakeBand: [0.08, 0.34],
    scoreBand: [0.12, 0.38],
  },
  medium: {
    expectedSolveSeconds: [5, 9],
    maxSteps: 2,
    abstractionBand: [0.2, 0.58],
    notationBand: [0.2, 0.62],
    visualBand: [0.1, 0.68],
    mistakeBand: [0.2, 0.58],
    scoreBand: [0.35, 0.69],
  },
  hard: {
    expectedSolveSeconds: [8, 15],
    maxSteps: 4,
    abstractionBand: [0.4, 0.9],
    notationBand: [0.35, 0.9],
    visualBand: [0.2, 0.86],
    mistakeBand: [0.4, 0.9],
    scoreBand: [0.62, 0.96],
  },
};

const TOPIC_TIMER_DEFAULTS = {
  arithmetic: { tiny: 8, easy: 6, medium: 9, hard: 12 },
  algebra: { tiny: 9, easy: 8, medium: 11, hard: 15 },
  geometry: { tiny: 9, easy: 8, medium: 12, hard: 16 },
  fractions: { tiny: 9, easy: 8, medium: 11, hard: 14 },
  percentages: { tiny: 9, easy: 8, medium: 11, hard: 14 },
  ratios: { tiny: 9, easy: 8, medium: 11, hard: 14 },
  graphs_functions: {
    tiny: GRAPH_TIMER_SECONDS.tiny,
    easy: GRAPH_TIMER_SECONDS.easy,
    medium: GRAPH_TIMER_SECONDS.medium,
    hard: GRAPH_TIMER_SECONDS.hard,
  },
  calculus: { tiny: 11, easy: 10, medium: 14, hard: 18 },
};

const TOPIC_RULES = {
  arithmetic: {
    tiny: {
      allowedOperations: ["add", "sub"],
      maxOperands: 2,
      numberCeiling: 18,
      maxExpressionLength: 14,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["add", "sub"],
      maxOperands: 2,
      numberCeiling: 30,
      maxExpressionLength: 26,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["add", "sub", "mul", "div"],
      maxOperands: 3,
      numberCeiling: 120,
      maxExpressionLength: 36,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["add", "sub", "mul", "div", "grouping"],
      maxOperands: 4,
      numberCeiling: 240,
      maxExpressionLength: 44,
      visualRequired: false,
    },
  },
  algebra: {
    tiny: {
      allowedOperations: ["add", "sub", "mul"],
      maxOperands: 3,
      numberCeiling: 20,
      maxExpressionLength: 34,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["add", "sub", "mul"],
      maxOperands: 3,
      numberCeiling: 24,
      maxExpressionLength: 36,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["add", "sub", "mul", "grouping"],
      maxOperands: 4,
      numberCeiling: 42,
      maxExpressionLength: 54,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["add", "sub", "mul", "div", "grouping"],
      maxOperands: 5,
      numberCeiling: 60,
      maxExpressionLength: 64,
      visualRequired: false,
    },
  },
  fractions: {
    tiny: {
      allowedOperations: ["fraction_add", "fraction_sub", "fraction_of_whole"],
      maxOperands: 2,
      denominatorCeiling: 8,
      maxExpressionLength: 34,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["fraction_add", "fraction_sub", "fraction_of_whole"],
      maxOperands: 2,
      denominatorCeiling: 12,
      maxExpressionLength: 38,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["fraction_add", "fraction_sub", "fraction_mul"],
      maxOperands: 3,
      denominatorCeiling: 18,
      maxExpressionLength: 44,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["fraction_mul", "fraction_div", "fraction_mix"],
      maxOperands: 4,
      denominatorCeiling: 24,
      maxExpressionLength: 56,
      visualRequired: false,
    },
  },
  percentages: {
    tiny: {
      allowedOperations: ["percent_of", "fraction_percent"],
      maxOperands: 2,
      numberCeiling: 240,
      maxExpressionLength: 38,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["percent_of", "fraction_percent"],
      maxOperands: 2,
      numberCeiling: 300,
      maxExpressionLength: 40,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["percent_of", "percent_change"],
      maxOperands: 3,
      numberCeiling: 500,
      maxExpressionLength: 54,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["percent_reverse", "percent_change"],
      maxOperands: 4,
      numberCeiling: 900,
      maxExpressionLength: 68,
      visualRequired: false,
    },
  },
  ratios: {
    tiny: {
      allowedOperations: ["ratio_simplify", "ratio_scale"],
      maxOperands: 3,
      numberCeiling: 48,
      maxExpressionLength: 38,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["ratio_simplify", "ratio_scale"],
      maxOperands: 3,
      numberCeiling: 60,
      maxExpressionLength: 40,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["ratio_divide", "ratio_scale"],
      maxOperands: 4,
      numberCeiling: 120,
      maxExpressionLength: 54,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["ratio_divide", "ratio_reverse"],
      maxOperands: 5,
      numberCeiling: 220,
      maxExpressionLength: 68,
      visualRequired: false,
    },
  },
  geometry: {
    tiny: {
      allowedOperations: ["perimeter", "angles"],
      maxOperands: 3,
      numberCeiling: 72,
      maxExpressionLength: 48,
      visualRequired: true,
    },
    easy: {
      allowedOperations: ["perimeter", "angles"],
      maxOperands: 3,
      numberCeiling: 80,
      maxExpressionLength: 50,
      visualRequired: true,
    },
    medium: {
      allowedOperations: ["area", "angles", "circumference"],
      maxOperands: 4,
      numberCeiling: 140,
      maxExpressionLength: 64,
      visualRequired: true,
    },
    hard: {
      allowedOperations: ["area", "angles", "composite"],
      maxOperands: 5,
      numberCeiling: 220,
      maxExpressionLength: 76,
      visualRequired: true,
    },
  },
  graphs_functions: {
    tiny: {
      allowedOperations: ["read_point", "evaluate_function"],
      maxOperands: 3,
      numberCeiling: 36,
      maxExpressionLength: 50,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["read_point", "evaluate_function"],
      maxOperands: 3,
      numberCeiling: 40,
      maxExpressionLength: 54,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["slope", "intercept", "evaluate_function"],
      maxOperands: 4,
      numberCeiling: 80,
      maxExpressionLength: 64,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["line_from_points", "composition", "rate"],
      maxOperands: 5,
      numberCeiling: 140,
      maxExpressionLength: 78,
      visualRequired: false,
    },
  },
  calculus: {
    tiny: {
      allowedOperations: ["function_evaluation", "power_rule", "derivative_at_point"],
      maxOperands: 3,
      numberCeiling: 28,
      maxExpressionLength: 56,
      visualRequired: false,
    },
    easy: {
      allowedOperations: ["function_evaluation", "power_rule", "derivative_at_point"],
      maxOperands: 3,
      numberCeiling: 30,
      maxExpressionLength: 58,
      visualRequired: false,
    },
    medium: {
      allowedOperations: ["polynomial_derivative", "combine_like_terms", "derivative_at_point"],
      maxOperands: 4,
      numberCeiling: 60,
      maxExpressionLength: 70,
      visualRequired: false,
    },
    hard: {
      allowedOperations: ["high_degree_derivative", "derivative_at_point", "derivative_plus_evaluation"],
      maxOperands: 5,
      numberCeiling: 100,
      maxExpressionLength: 84,
      visualRequired: false,
    },
  },
};

function isValidTopic(topic) {
  return TOPICS.includes(topic);
}

function isValidDifficulty(difficulty) {
  return DIFFICULTIES.includes(difficulty);
}

function normalizeTopic(topic) {
  if (isValidTopic(topic)) return topic;
  if (typeof topic === "string") {
    const normalized = topic.trim().toLowerCase();
    if (isValidTopic(normalized)) return normalized;
    if (LEGACY_TOPIC_ALIASES[normalized]) return LEGACY_TOPIC_ALIASES[normalized];
  }
  return "arithmetic";
}

function normalizeDifficulty(difficulty) {
  if (isValidDifficulty(difficulty)) return difficulty;
  if (typeof difficulty === "string") {
    const normalized = difficulty.trim().toLowerCase();
    if (isValidDifficulty(normalized)) return normalized;
  }
  return "easy";
}

function getRules(topic, difficulty) {
  const safeTopic = normalizeTopic(topic);
  const safeDifficulty = normalizeDifficulty(difficulty);

  return {
    topic: safeTopic,
    difficulty: safeDifficulty,
    timerSeconds: TOPIC_TIMER_DEFAULTS[safeTopic][safeDifficulty],
    profile: DIFFICULTY_PROFILE[safeDifficulty],
    ...TOPIC_RULES[safeTopic][safeDifficulty],
  };
}

function getQuestionTimerSeconds(topic, difficulty) {
  return getRules(topic, difficulty).timerSeconds;
}

function getMatchDurationSeconds(difficulty) {
  const safeDifficulty = normalizeDifficulty(difficulty);
  return GLOBAL_TUNING.matchDurationByDifficultySeconds[safeDifficulty];
}

module.exports = {
  TOPICS,
  DIFFICULTIES,
  GLOBAL_TUNING,
  DIFFICULTY_PROFILE,
  TOPIC_TIMER_DEFAULTS,
  TOPIC_RULES,
  LEGACY_TOPIC_ALIASES,
  isValidTopic,
  isValidDifficulty,
  normalizeTopic,
  normalizeDifficulty,
  getRules,
  getQuestionTimerSeconds,
  getMatchDurationSeconds,
};
