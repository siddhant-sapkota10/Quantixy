import { LeaderboardClient } from "@/components/leaderboard-client";
import { PageShell } from "@/components/page-shell";

export default function LeaderboardPage() {
  return (
    <PageShell className="flex items-start justify-center sm:items-center">
      <LeaderboardClient />
    </PageShell>
  );
}
