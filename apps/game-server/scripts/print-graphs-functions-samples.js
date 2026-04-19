/* eslint-disable no-console */

const { generateQuestionBatch } = require("../../../packages/shared/question-engine");

const DIFFICULTIES = ["easy", "medium", "hard"];

function printDifficultySamples(difficulty) {
  const batch = generateQuestionBatch("graphs_functions", difficulty, 36, `gf:${difficulty}`);
  const bySubtype = new Map();

  console.log(`\n=== GRAPHS_FUNCTIONS ${difficulty.toUpperCase()} ===`);
  for (const q of batch) {
    bySubtype.set(q.subtype, (bySubtype.get(q.subtype) ?? 0) + 1);
    console.log(
      `- [${q.subtype}] ${q.prompt} -> ${q.correctAnswer} ` +
        `(timer=${q.timing?.questionTimerSeconds}s, est=${q.estimatedSolveTime}s, score=${q.difficultyScore}, mode=${q.renderMode})`
    );
  }

  console.log("\nSubtype counts:");
  for (const [subtype, count] of [...bySubtype.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${subtype}: ${count}`);
  }
}

for (const difficulty of DIFFICULTIES) {
  printDifficultySamples(difficulty);
}

