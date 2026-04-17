export const TOPICS = [
  "arithmetic",
  "algebra",
  "geometry",
  "fractions",
  "ratios",
  "exponents",
  "statistics",
  "trigonometry",
  "functions",
  "calculus"
] as const;

export type Topic = (typeof TOPICS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

const TOPIC_LABELS: Record<Topic, string> = {
  arithmetic: "Lightning Arithmetic",
  algebra: "Quick Algebra",
  geometry: "Visual Geometry",
  fractions: "Fractions and Percents",
  ratios: "Ratio Tactics",
  exponents: "Powers and Roots",
  statistics: "Patterns and Probability",
  trigonometry: "Angle Battles",
  functions: "Coordinates and Graphs",
  calculus: "Advanced Sprint",
};

export const formatTopicLabel = (topic: Topic) => TOPIC_LABELS[topic] ?? topic;

export const isTopic = (value?: string): value is Topic =>
  value !== undefined && (TOPICS as readonly string[]).includes(value);

export const getSafeTopic = (value?: string): Topic =>
  isTopic(value) ? value : "arithmetic";

export const isDifficulty = (value?: string): value is Difficulty =>
  value !== undefined && (DIFFICULTIES as readonly string[]).includes(value);

export const getSafeDifficulty = (value?: string): Difficulty =>
  isDifficulty(value) ? value : "easy";
