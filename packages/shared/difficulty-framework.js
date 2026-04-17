/**
 * Central difficulty framework.
 * - Explicit, explainable constraints per topic + difficulty
 * - Single source of truth for timers
 */

/** @typedef {"easy"|"medium"|"hard"} Difficulty */
/** @typedef {"arithmetic"|"algebra"|"geometry"|"fractions"|"ratios"|"exponents"|"statistics"|"trigonometry"|"functions"|"calculus"} Topic */

/**
 * @typedef {Object} DifficultyRules
 * @property {number} timerSeconds - per-question time limit (server-enforced)
 * @property {number} maxSteps - maximum intended steps
 * @property {boolean} allowBrackets
 * @property {boolean} allowDivision
 * @property {boolean} allowNegativeAnswer
 * @property {{min:number,max:number}} intRange
 * @property {number[]} allowedOpsMask - operation ids used by validators/generators
 */

const OPS = {
  ADD: 1,
  SUB: 2,
  MUL: 3,
  DIV: 4,
};

/** @type {Record<Topic, Record<Difficulty, DifficultyRules>>} */
const DIFFICULTY_RULES = {
  arithmetic: {
    easy: {
      timerSeconds: 6,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      // User-facing: small numbers (1–10-ish), instant solve.
      intRange: { min: 0, max: 20 },
      allowedOpsMask: [OPS.ADD, OPS.SUB],
    },
    medium: {
      timerSeconds: 10,
      maxSteps: 2,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 100 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    hard: {
      timerSeconds: 15,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 240 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL, OPS.DIV],
    },
  },
  algebra: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: true,
      intRange: { min: -12, max: 12 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    medium: {
      timerSeconds: 10,
      maxSteps: 2,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: true,
      intRange: { min: -15, max: 15 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    hard: {
      timerSeconds: 14,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: true,
      intRange: { min: -18, max: 18 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL, OPS.DIV],
    },
  },
  geometry: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 20 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    medium: {
      timerSeconds: 10,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 30 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    hard: {
      timerSeconds: 15,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 40 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
  },
  fractions: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 12 },
      allowedOpsMask: [OPS.ADD, OPS.SUB],
    },
    medium: {
      timerSeconds: 11,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 16 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL, OPS.DIV],
    },
    hard: {
      timerSeconds: 16,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 20 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL, OPS.DIV],
    },
  },
  ratios: {
    easy: {
      timerSeconds: 6,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 20 },
      allowedOpsMask: [OPS.MUL, OPS.DIV, OPS.ADD, OPS.SUB],
    },
    medium: {
      timerSeconds: 10,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 30 },
      allowedOpsMask: [OPS.MUL, OPS.DIV, OPS.ADD, OPS.SUB],
    },
    hard: {
      timerSeconds: 14,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 40 },
      allowedOpsMask: [OPS.MUL, OPS.DIV, OPS.ADD, OPS.SUB],
    },
  },
  exponents: {
    easy: {
      timerSeconds: 6,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 12 },
      allowedOpsMask: [OPS.MUL],
    },
    medium: {
      timerSeconds: 10,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 18 },
      allowedOpsMask: [OPS.MUL],
    },
    hard: {
      timerSeconds: 14,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 1, max: 24 },
      allowedOpsMask: [OPS.MUL],
    },
  },
  statistics: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 30 },
      allowedOpsMask: [OPS.ADD, OPS.DIV, OPS.SUB],
    },
    medium: {
      timerSeconds: 11,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 40 },
      allowedOpsMask: [OPS.ADD, OPS.DIV, OPS.SUB],
    },
    hard: {
      timerSeconds: 16,
      maxSteps: 3,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 60 },
      allowedOpsMask: [OPS.ADD, OPS.DIV, OPS.SUB],
    },
  },
  trigonometry: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 180 },
      allowedOpsMask: [OPS.SUB, OPS.DIV],
    },
    medium: {
      timerSeconds: 12,
      maxSteps: 2,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 180 },
      allowedOpsMask: [OPS.SUB, OPS.DIV],
    },
    hard: {
      timerSeconds: 17,
      maxSteps: 3,
      allowBrackets: false,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 180 },
      allowedOpsMask: [OPS.SUB, OPS.DIV],
    },
  },
  functions: {
    easy: {
      timerSeconds: 7,
      maxSteps: 1,
      // Function notation uses parentheses: f(x), f(2), etc.
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: true,
      intRange: { min: -6, max: 6 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    medium: {
      timerSeconds: 12,
      maxSteps: 2,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: true,
      intRange: { min: -8, max: 8 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL],
    },
    hard: {
      timerSeconds: 17,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: true,
      intRange: { min: -10, max: 10 },
      allowedOpsMask: [OPS.ADD, OPS.SUB, OPS.MUL, OPS.DIV],
    },
  },
  calculus: {
    easy: {
      timerSeconds: 8,
      maxSteps: 1,
      // Calculus prompts often include parentheses like d/dx ( ... ).
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 10 },
      allowedOpsMask: [OPS.MUL],
    },
    medium: {
      timerSeconds: 13,
      maxSteps: 2,
      allowBrackets: true,
      allowDivision: false,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 12 },
      allowedOpsMask: [OPS.MUL, OPS.ADD, OPS.SUB],
    },
    hard: {
      timerSeconds: 18,
      maxSteps: 3,
      allowBrackets: true,
      allowDivision: true,
      allowNegativeAnswer: false,
      intRange: { min: 0, max: 15 },
      allowedOpsMask: [OPS.MUL, OPS.ADD, OPS.SUB, OPS.DIV],
    },
  },
};

function getRules(topic, difficulty) {
  const t = DIFFICULTY_RULES[topic] ? topic : "arithmetic";
  const d = DIFFICULTY_RULES[t][difficulty] ? difficulty : "easy";
  return DIFFICULTY_RULES[t][d];
}

function getQuestionTimerSeconds(topic, difficulty) {
  return getRules(topic, difficulty).timerSeconds;
}

module.exports = {
  OPS,
  DIFFICULTY_RULES,
  getRules,
  getQuestionTimerSeconds,
};

