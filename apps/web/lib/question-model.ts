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

export type QuestionRenderMode = "plain_text" | "latex" | "graph" | "diagram" | "table";
export type QuestionFormat = "multiple_choice" | "true_false" | "rank_order" | "fill_in";

export type GraphFunctionSubtype =
  | "read_x_coordinate"
  | "read_y_coordinate"
  | "read_point_coordinate"
  | "read_x_intercept"
  | "read_y_intercept"
  | "evaluate_function"
  | "read_table"
  | "identify_rule_from_table"
  | "match_equation"
  | "identify_slope"
  | "increasing_decreasing"
  | "transformation"
  | "compare_graphs"
  | "infer_rule_then_evaluate";

export type GraphVisualData = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  showAxisNumbers: boolean;
  showAxisLabels: boolean;
  points?: Array<{
    x: number;
    y: number;
    label?: string;
  }>;
  lines?: Array<{
    type: "linear";
    m: number;
    b: number;
    label?: string;
  }>;
  tables?: Array<{
    x: number;
    y: number;
  }>;
};

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
    }
  | {
      kind: "graph-cartesian";
      xRange: [number, number];
      yRange: [number, number];
      showGrid?: boolean;
      showAxisNumbers?: boolean;
      showAxisLabels?: boolean;
      points?: Array<{ x: number; y: number; label?: string; color?: string }>;
      lines?: Array<{ m: number; b: number; label?: string; color?: string }>;
    };

export type DuelQuestion = {
  id: string;
  topic: string;
  subtype: string | GraphFunctionSubtype;
  difficulty: string;
  format?: QuestionFormat;
  prompt: string;
  correctAnswer?: string;
  wrongAnswers?: string[];
  options?: string[];
  hiddenOptionIndexes?: number[];
  explanation?: string;
  estimatedSolveTime?: number;
  difficultyScore?: number;
  renderMode?: QuestionRenderMode;
  visualData?: GraphVisualData;
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
