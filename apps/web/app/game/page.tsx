import { GameClient } from "@/components/game-client";
import { PageShell } from "@/components/page-shell";

type GamePageProps = {
  searchParams: {
    topic?: string;
    difficulty?: string;
  };
};

export default function GamePage({ searchParams }: GamePageProps) {
  return (
    <PageShell className="flex items-center justify-center">
      <GameClient initialTopic={searchParams.topic} initialDifficulty={searchParams.difficulty} />
    </PageShell>
  );
}
