import { GameClient } from "@/components/game-client";
import { AiGameClient } from "@/components/ai-game-client";
import { PageShell } from "@/components/page-shell";

type GamePageProps = {
  searchParams: {
    topic?: string;
    difficulty?: string;
    aiDifficulty?: string;
    mode?: string;
    aiMode?: string;
    match?: string;
    roomCode?: string;
  };
};

export default function GamePage({ searchParams }: GamePageProps) {
  const isAi = searchParams.mode === "ai";

  return (
    <PageShell className="flex items-start justify-center sm:items-center">
      {isAi ? (
        <AiGameClient
          initialTopic={searchParams.topic}
          initialDifficulty={searchParams.difficulty}
          initialAiDifficulty={searchParams.aiDifficulty}
          opponentMode={searchParams.aiMode === "duel" ? "duel" : "practice"}
        />
      ) : (
        <GameClient
          initialTopic={searchParams.topic}
          initialDifficulty={searchParams.difficulty}
          matchType={searchParams.match}
          initialRoomCode={searchParams.roomCode}
        />
      )}
    </PageShell>
  );
}
