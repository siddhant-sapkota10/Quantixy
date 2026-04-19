export const TOPICS = [
  "arithmetic",
  "algebra",
  "fractions",
  "percentages",
  "ratios",
  "geometry",
  "graphs_functions",
  "calculus"
] as const;

export type Topic = (typeof TOPICS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

const TOPIC_LABELS: Record<Topic, string> = {
  arithmetic: "Lightning Arithmetic",
  algebra: "Quick Algebra",
  fractions: "Fractions",
  percentages: "Percentages",
  ratios: "Ratio Tactics",
  geometry: "Visual Geometry",
  graphs_functions: "Graphs and Functions",
  calculus: "Advanced Sprint",
};

export const formatTopicLabel = (topic: Topic) => TOPIC_LABELS[topic] ?? topic;

export const isTopic = (value?: string): value is Topic =>
  value !== undefined && (TOPICS as readonly string[]).includes(value);

export const getSafeTopic = (value?: string): Topic =>
  isTopic(value)
    ? value
    : value === "functions" ||
        value === "graphs" ||
        value === "graphs-functions" ||
        value === "graphs/functions" ||
        value === "graphs_and_functions"
      ? "graphs_functions"
      : value === "trigonometry"
        ? "geometry"
        : value === "statistics"
          ? "percentages"
          : value === "exponents"
            ? "algebra"
            : "arithmetic";

export const isDifficulty = (value?: string): value is Difficulty =>
  value !== undefined && (DIFFICULTIES as readonly string[]).includes(value);

export const getSafeDifficulty = (value?: string): Difficulty =>
  isDifficulty(value) ? value : "easy";
