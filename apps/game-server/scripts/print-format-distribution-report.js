#!/usr/bin/env node
/* eslint-disable no-console */

const {
  TOPICS,
  DIFFICULTIES,
  generateFormatDistributionReport,
} = require("../../../packages/shared/question-engine");

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

function toList(raw, fallback) {
  if (!raw) return fallback;
  return String(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv);
  const topics = toList(args.topics, TOPICS).filter((x) => TOPICS.includes(x));
  const difficulties = toList(args.difficulties, DIFFICULTIES).filter((x) => DIFFICULTIES.includes(x));
  const countPerCombo = Math.max(20, Math.min(1000, Number.parseInt(String(args.count ?? "120"), 10) || 120));

  const report = generateFormatDistributionReport({ topics, difficulties, countPerCombo });

  console.log(`\n=== FORMAT DISTRIBUTION REPORT (count=${countPerCombo}) ===`);
  for (const row of report) {
    const parts = [
      `${row.topic}/${row.difficulty}`,
      `active=${row.activeFormats.join("|") || "none"}`,
      `spread=${row.spread}`,
      `counts=${JSON.stringify(row.formatCounts)}`,
    ];
    console.log(parts.join(" :: "));
    if (row.flags.length > 0) {
      console.log(`  FLAGS: ${row.flags.join(", ")}`);
    }
  }

  const flagged = report.filter((x) => x.flags.length > 0);
  console.log(`\nFlagged combos: ${flagged.length}/${report.length}`);
}

main();
