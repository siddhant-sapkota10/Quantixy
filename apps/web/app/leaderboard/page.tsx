import { LeaderboardClient } from "@/components/leaderboard-client";
import { PageShell } from "@/components/page-shell";

export default function LeaderboardPage() {
  return (
    <PageShell className="flex items-center justify-center">
      <LeaderboardClient />
    </PageShell>
  );
}
