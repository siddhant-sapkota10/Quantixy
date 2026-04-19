#!/usr/bin/env node
/* eslint-disable no-console */

const {
  TOPICS,
  DIFFICULTIES,
  generateQuestionBatch,
  generateRoundQuestionSequence,
} = require("../../../packages/shared/question-engine");

const VALID_FORMATS = new Set(["multiple_choice", "true_false", "rank_order", "fill_in"]);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = value;
  }
  return out;
}

function printUsage() {
  console.log("Usage:");
  console.log("  node apps/game-server/scripts/print-question-engine-samples.js --topic arithmetic --difficulty easy --count 30");
  console.log("  node apps/game-server/scripts/print-question-engine-samples.js --topic algebra --difficulty medium --format true_false --count 30");
  console.log("  node apps/game-server/scripts/print-question-engine-samples.js --topic fractions --difficulty hard --format rank_order --count 30");
  console.log("  node apps/game-server/scripts/print-question-engine-samples.js --topic graphs_functions --difficulty easy --round true --count 20");
}

function main() {
  const args = parseArgs(process.argv);
  const topic = String(args.topic ?? "arithmetic");
  const difficulty = String(args.difficulty ?? "easy");
  const count = Math.max(1, Math.min(200, Number.parseInt(String(args.count ?? "30"), 10) || 30));
  const forceFormat = args.format ? String(args.format) : null;
  const roundMode = String(args.round ?? "false") === "true";

  if (!TOPICS.includes(topic)) {
    console.error(`Invalid --topic "${topic}". Expected one of: ${TOPICS.join(", ")}`);
    printUsage();
    process.exit(1);
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    console.error(`Invalid --difficulty "${difficulty}". Expected: ${DIFFICULTIES.join(", ")}`);
    printUsage();
    process.exit(1);
  }
  if (forceFormat && !VALID_FORMATS.has(forceFormat)) {
    console.error(`Invalid --format "${forceFormat}". Expected: ${[...VALID_FORMATS].join(", ")}`);
    printUsage();
    process.exit(1);
  }

  const batch = roundMode
    ? generateRoundQuestionSequence(topic, difficulty, count, `round-audit:${topic}:${difficulty}`)
    : generateQuestionBatch(topic, difficulty, count, `batch-audit:${topic}:${difficulty}`, {
        forceFormat: forceFormat ?? undefined,
      });

  const bySubtype = {};
  const byFormat = {};
  const byRender = {};

  console.log(`\n=== ${topic.toUpperCase()} ${difficulty.toUpperCase()} (${count}) ===`);
  if (forceFormat) console.log(`Forced format: ${forceFormat}`);
  if (roundMode) console.log("Round mode: true (pacing rotation enabled)");

  batch.forEach((q, idx) => {
    bySubtype[q.subtype] = (bySubtype[q.subtype] ?? 0) + 1;
    byFormat[q.format ?? "unknown"] = (byFormat[q.format ?? "unknown"] ?? 0) + 1;
    byRender[q.renderMode ?? "unknown"] = (byRender[q.renderMode ?? "unknown"] ?? 0) + 1;

    const opts = Array.isArray(q.options) && q.options.length > 0 ? ` options=${q.options.join(" | ")}` : "";
    console.log(
      `${String(idx + 1).padStart(2, "0")}. [${q.format}] [${q.subtype}] ${q.prompt} -> ${q.correctAnswer}${opts}`
    );
  });

  console.log("\nFormat counts:", byFormat);
  console.log("Subtype counts:", bySubtype);
  console.log("Render counts:", byRender);
}

main();

