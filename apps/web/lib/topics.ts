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

export const formatTopicLabel = (topic: Topic) =>
  topic
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export const isTopic = (value?: string): value is Topic =>
  value !== undefined && (TOPICS as readonly string[]).includes(value);

export const getSafeTopic = (value?: string): Topic =>
  isTopic(value) ? value : "arithmetic";

export const isDifficulty = (value?: string): value is Difficulty =>
  value !== undefined && (DIFFICULTIES as readonly string[]).includes(value);

export const getSafeDifficulty = (value?: string): Difficulty =>
  isDifficulty(value) ? value : "easy";
