const K_FACTOR_DEFAULT = 32;

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function calculateEloDelta(playerRating, opponentRating, actualScore, kFactor = K_FACTOR_DEFAULT) {
  const expected = expectedScore(playerRating, opponentRating);
  return Math.round(kFactor * (actualScore - expected));
}

function deriveMatchOutcome(playerOneScore, playerTwoScore) {
  if (playerOneScore > playerTwoScore) {
    return {
      result: "win",
      playerOneActualScore: 1,
      playerTwoActualScore: 0,
      winnerSide: "player_one"
    };
  }

  if (playerTwoScore > playerOneScore) {
    return {
      result: "loss",
      playerOneActualScore: 0,
      playerTwoActualScore: 1,
      winnerSide: "player_two"
    };
  }

  return {
    result: "draw",
    playerOneActualScore: 0.5,
    playerTwoActualScore: 0.5,
    winnerSide: null
  };
}

module.exports = {
  K_FACTOR_DEFAULT,
  expectedScore,
  calculateEloDelta,
  deriveMatchOutcome
};
