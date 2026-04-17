export type QuestionAnswerType = "int" | "number" | "fraction" | "percent" | "text" | "angle";
export type QuestionInputMode = "number" | "text";
export type QuestionVisualType =
  | "none"
  | "shape"
  | "angle"
  | "coordinate"
  | "number_line"
  | "fraction_bar"
  | "pattern";

export type DiagramSpec =
  | {
      kind: "rectangle";
      width: number;
      height: number;
      labels?: { width?: string; height?: string };
    }
  | {
      kind: "triangle-angle";
      values: { a: number; b: number; c: number | "?" };
    }
  | {
      kind: "circle";
      radius: number;
      showDiameter?: boolean;
      label?: string;
    }
  | {
      kind: "line-angle";
      known: number;
      unknownLabel?: string;
    }
  | {
      kind: "fraction-bars";
      denominator: number;
      numerators: [number, number];
      operation?: "+" | "-";
    }
  | {
      kind: "fraction-of-number";
      numerator: number;
      denominator: number;
      whole: number;
    }
  | {
      kind: "fraction-compare-line";
      left: { n: number; d: number };
      right: { n: number; d: number };
    }
  | {
      kind: "ratio-dots";
      red: number;
      blue: number;
      ask: "red" | "blue";
    }
  | {
      kind: "sequence-boxes";
      values: Array<number | string>;
    }
  | {
      kind: "probability-line";
      favorable: number;
      total: number;
    }
  | {
      kind: "right-triangle";
      sides: { opp: number; adj: number; hyp: number };
      ask: "sin" | "cos" | "tan";
    }
  | {
      kind: "coordinate-point";
      x: number;
      y: number;
      label?: string;
      xRange?: [number, number];
      yRange?: [number, number];
    }
  | {
      kind: "coordinate-two-points";
      a: { x: number; y: number; label?: string };
      b: { x: number; y: number; label?: string };
      xRange?: [number, number];
      yRange?: [number, number];
    };

export type DuelQuestion = {
  id: string;
  topic: string;
  subtype: string;
  difficulty: string;
  prompt: string;
  answer: string;
  acceptedAnswers?: string[];
  answerType: QuestionAnswerType;
  inputMode: QuestionInputMode;
  timeSuitability: "rapid" | "medium";
  visualType: QuestionVisualType;
  diagramSpec: DiagramSpec | null;
  formatting?: {
    style?: "plain" | "math";
    unit?: string | null;
    expression?: string | null;
  };
  unit?: string | null;
  gameplayDifficulty?: {
    level: "easy" | "medium" | "hard" | string;
    rubric?: {
      readingLoad?: string;
      expectedSeconds?: [number, number];
      maxSteps?: number;
      visualComplexity?: string;
      pressure?: string;
    };
  };
  timing?: {
    expectedSolveSeconds?: number;
    matchDurationSeconds?: number;
  };
  meta?: {
    estimatedSeconds?: number;
    tags?: string[];
  };
};
