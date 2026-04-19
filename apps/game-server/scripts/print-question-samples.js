/* eslint-disable no-console */

const { TOPICS, DIFFICULTIES, generateQuestionBatch } = require("../../../packages/shared/question-engine");

function pad(s, n) {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

function print() {
  for (const topic of TOPICS) {
    console.log(`\n=== ${topic.toUpperCase()} ===`);
    for (const diff of DIFFICULTIES) {
      console.log(`\n${pad(diff.toUpperCase(), 6)}:`);
      const batch = generateQuestionBatch(topic, diff, 20, `samples:${topic}:${diff}`);
      for (const q of batch) {
        const timer = q.timing?.questionTimerSeconds ?? "?";
        console.log(
          `- ${q.prompt}  ->  ${q.correctAnswer ?? q.answer}  [${q.subtype}]  (${timer}s, est=${q.estimatedSolveTime}s, score=${q.difficultyScore})`
        );
      }
    }
  }
}

print();
