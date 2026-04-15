import { GameClient } from "@/components/game-client";
import { AiGameClient } from "@/components/ai-game-client";
import { PageShell } from "@/components/page-shell";

type GamePageProps = {
  searchParams: {
    topic?: string;
    difficulty?: string;
    mode?: string;
    match?: string;
    roomCode?: string;
  };
};

export default function GamePage({ searchParams }: GamePageProps) {
  const isAi = searchParams.mode === "ai";

  return (
    <PageShell className="flex items-center justify-center">
      {isAi ? (
        <AiGameClient
          initialTopic={searchParams.topic}
          initialDifficulty={searchParams.difficulty}
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
