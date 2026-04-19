const abilities = [
  {
    avatar: 'Shadow',
    ultimate: 'Void Glitch',
    questions: 4,
    simulate() {
      return {
        hiddenChoiceSets: [
          [1, 3],
          [0, 2],
          [1, 2],
          [0, 3]
        ],
        note: 'Two opponent choices are hidden per affected question, still clickable.'
      };
    }
  },
  {
    avatar: 'Blaze',
    ultimate: 'Wildfire Surge',
    questions: 4,
    simulate() {
      const correctPattern = [true, true, false, true];
      let stacks = 0;
      const ticks = [];
      for (const ok of correctPattern) {
        if (ok) stacks = Math.min(5, stacks + 1);
        else stacks = Math.max(0, stacks - 1);
        const burnDamage = stacks > 0 ? 1 + (stacks - 1) : 0;
        ticks.push({ ok, stacks, burnDamage });
      }
      return { correctPattern, ticks };
    }
  },
  {
    avatar: 'Guardian',
    ultimate: 'Reflect Bastion',
    questions: 4,
    simulate() {
      const incoming = [14, 11, 17, 9];
      return incoming.map((value) => {
        const reduced = Math.max(1, Math.round(value * 0.62));
        const prevented = Math.max(0, value - reduced);
        const reflected = Math.max(0, Math.round(prevented * 0.28));
        return { incoming: value, reduced, reflected };
      });
    }
  },
  {
    avatar: 'Flash',
    ultimate: 'Overclock',
    questions: 4,
    simulate() {
      const responseMs = [1200, 2100, 3400, 1500];
      return responseMs.map((ms) => {
        const multiplier = ms <= 1800 ? 1.45 : ms <= 3200 ? 1.25 : 1.1;
        return { responseMs: ms, multiplier };
      });
    }
  },
  {
    avatar: 'Architect',
    ultimate: 'Deconstruct',
    questions: 6,
    simulate() {
      const opponentCorrectBase = [10, 12, 9, 11, 10, 13];
      return opponentCorrectBase.map((base) => ({
        base,
        reduced: Math.max(1, Math.round(base * 0.58))
      }));
    }
  },
  {
    avatar: 'Titan',
    ultimate: 'Cataclysm',
    questions: 6,
    simulate() {
      const correctBase = [9, 11, 10, 12, 8, 10];
      const boosted = correctBase.map((base) => Math.max(1, Math.round(base * 1.55)) + 3);
      return {
        boosted,
        wrongAnswerSelfDamage: 0,
        incomingMitigationMultiplier: 0.85
      };
    }
  }
];

for (const ability of abilities) {
  const result = ability.simulate();
  console.log(`\n=== ${ability.avatar} :: ${ability.ultimate} (${ability.questions} questions) ===`);
  console.log(JSON.stringify(result, null, 2));
}
