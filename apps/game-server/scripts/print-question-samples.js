/* eslint-disable no-console */

const { TOPICS, DIFFICULTIES, generateQuestion } = require("../../../packages/shared/question-engine");

function pad(s, n) {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

function print() {
  for (const topic of TOPICS) {
    console.log(`\n=== ${topic.toUpperCase()} ===`);
    for (const diff of DIFFICULTIES) {
      console.log(`\n${pad(diff.toUpperCase(), 6)}:`);
      for (let i = 0; i < 20; i += 1) {
        const q = generateQuestion(topic, diff, `samples:${topic}:${diff}`);
        const timer = q.timing?.questionTimerSeconds ?? "?";
        console.log(`- ${q.prompt}  ->  ${q.answer}  [${q.subtype}]  (${timer}s)`);
      }
    }
  }
}

print();

