/**
 * Centralized tuning for Graphs & Functions.
 * This is shared by generation + validation logic.
 */

const GRAPH_TIMER_SECONDS = {
  easy: 9,
  medium: 12,
  hard: 16,
};

const GRAPH_VISUAL_TUNING = {
  minCanvasWidth: 420,
  minCanvasHeight: 300,
  pointRadius: 7,
  lineWidth: 3,
  labelFontPx: 15,
  axisNumberFontPx: 12,
  axisLabelFontPx: 14,
  padding: 36,
  maxGridTicksPerAxis: 17,
};

const GRAPH_RANGE_PRESETS = {
  easy: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, step: 1 },
  medium: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, step: 1 },
  hard: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, step: 1 },
};

const GRAPH_SUBTYPE_WEIGHTS = {
  easy: {
    read_x_coordinate: 4,
    read_y_coordinate: 4,
    read_point_coordinate: 3,
    read_y_intercept: 3,
    evaluate_function: 3,
    read_table: 3,
  },
  medium: {
    read_x_intercept: 3,
    read_y_intercept: 2,
    identify_slope: 4,
    match_equation: 4,
    read_table: 2,
    identify_rule_from_table: 3,
    increasing_decreasing: 2,
    evaluate_function: 2,
  },
  hard: {
    match_equation: 4,
    identify_slope: 3,
    compare_graphs: 3,
    transformation: 3,
    identify_rule_from_table: 2,
    increasing_decreasing: 2,
    infer_rule_then_evaluate: 3,
  },
};

module.exports = {
  GRAPH_TIMER_SECONDS,
  GRAPH_VISUAL_TUNING,
  GRAPH_RANGE_PRESETS,
  GRAPH_SUBTYPE_WEIGHTS,
};
