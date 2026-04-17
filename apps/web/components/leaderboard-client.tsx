"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Dropdown } from "@/components/dropdown";
import { RankBadge } from "@/components/rank-badge";
import { getAvatar } from "@/lib/avatars";
import { getSupabaseClient } from "@/lib/supabase";
import { TOPICS, Topic, formatTopicLabel } from "@/lib/topics";
import { PageContent } from "@/components/page-content";

type LeaderboardEntry = {
  rank: number;
  playerId: string;
  name: string;
  avatarId?: string;
  rating: number;
  topic: string;
};

type LeaderboardResponse = {
  topic: string;
  leaderboard: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
};

const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL;

const options = [
  { label: "All Topics", value: "all" },
  ...TOPICS.map((topic) => ({
    label: formatTopicLabel(topic),
    value: topic
  }))
];

export function LeaderboardClient() {
  const router = useRouter();
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leaderboardUrl = useMemo(() => {
    if (!socketUrl) {
      return null;
    }

    const url = new URL("/leaderboard", socketUrl);

    if (selectedTopic !== "all") {
      url.searchParams.set("topic", selectedTopic);
    }

    return url.toString();
  }, [selectedTopic]);

  useEffect(() => {
    if (!leaderboardUrl) {
      setError("NEXT_PUBLIC_SERVER_URL is not set.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);

        let accessToken: string | null = null;
        try {
          const supabase = getSupabaseClient();
          const {
            data: { session }
          } = await supabase.auth.getSession();
          accessToken = session?.access_token ?? null;
        } catch {
          accessToken = null;
        }

        const response = await fetch(leaderboardUrl, {
          signal: controller.signal,
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
        });

        if (!response.ok) {
          throw new Error("Failed to load leaderboard.");
        }

        const data = (await response.json()) as LeaderboardResponse;
        setEntries(data.leaderboard ?? []);
        setMyRank(data.myRank ?? null);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Unable to load leaderboard.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadLeaderboard();

    return () => {
      controller.abort();
    };
  }, [leaderboardUrl]);

  const visiblePlayerIds = useMemo(() => new Set(entries.map((entry) => entry.playerId)), [entries]);
  const showMyRankCard = Boolean(myRank && !visiblePlayerIds.has(myRank.playerId));

  return (
    <PageContent size="lg">
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="neon-badge inline-flex rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]">
              Competitive Rankings
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">Leaderboard</h1>
            <p className="text-textSecondary">Live standings from persisted player ratings.</p>
          </div>

          <div className="w-full max-w-xs space-y-2">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-textSecondary">Filter Topic</span>
            <Dropdown
              aria-label="Filter leaderboard by topic"
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value as Topic | "all")}
              options={options}
            />
          </div>
        </div>

        <div className="neon-panel-soft overflow-x-auto rounded-3xl">
          <div className="grid min-w-[300px] grid-cols-[44px_1fr_68px] gap-2 border-b border-indigo-300/20 px-3 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-textSecondary sm:grid-cols-[68px_1fr_96px_1fr] sm:gap-4 sm:px-6 sm:py-4">
            <span>#</span>
            <span>Player</span>
            <span>Rating</span>
            <span className="hidden sm:block">Topic</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-slate-300 sm:px-6">Loading leaderboard...</div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-rose-300 sm:px-6">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-300 sm:px-6">No ratings yet. Play a few matches first.</div>
          ) : (
            <div>
              {entries.map((entry, index) => {
                const isTopThree = index < 3;
                const isCurrentUser = myRank?.playerId === entry.playerId;

                return (
                  <div
                    key={entry.playerId}
                    className={`grid min-w-[300px] grid-cols-[44px_1fr_68px] items-center gap-2 border-b border-indigo-300/15 px-3 py-3 text-sm last:border-b-0 sm:grid-cols-[68px_1fr_96px_1fr] sm:gap-4 sm:px-6 sm:py-4 ${
                      isCurrentUser
                        ? "bg-cyan-400/[0.09]"
                        : isTopThree
                          ? "bg-indigo-400/[0.08]"
                          : ""
                    }`}
                  >
                    {/* Position */}
                    <span className={`text-sm font-bold tabular-nums ${isTopThree ? "text-cyan-200" : "text-slate-500"}`}>
                      {entry.rank}
                    </span>

                    {/* Player identity — avatar, name, rank badge */}
                    <span className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                      <span className="shrink-0 text-xl leading-none sm:text-2xl">{getAvatar(entry.avatarId).icon}</span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold text-white">{entry.name}</span>
                          {isCurrentUser ? (
                              <span className="shrink-0 rounded-full border border-cyan-300/45 bg-cyan-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
                                You
                              </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block">
                          <RankBadge rating={entry.rating} size="sm" />
                        </span>
                      </span>
                    </span>

                    {/* Rating — clean number, secondary to rank identity */}
                    <span className="font-bold tabular-nums text-slate-100">{entry.rating}</span>

                    <span className="hidden text-slate-400 sm:block">{formatTopicLabel(entry.topic as Topic)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showMyRankCard && myRank ? (
          <div className="rounded-2xl border border-cyan-300/28 bg-[linear-gradient(150deg,rgba(0,212,255,0.14),rgba(138,46,255,0.12))] px-4 py-4 sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-200">Your Standing</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-black tabular-nums text-cyan-100">#{myRank.rank}</span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{myRank.name}</span>
                  <RankBadge rating={myRank.rating} size="md" />
                </div>
                <p className="text-xs text-slate-400">
                  <span className="font-semibold tabular-nums text-slate-300">{myRank.rating}</span>
                  {" · "}
                  {formatTopicLabel(myRank.topic as Topic)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-start gap-3">
          <Button variant="secondary" onClick={() => router.push("/")}>Back to Home</Button>
          <Button variant="secondary" onClick={() => router.push("/profile")}>Profile</Button>
        </div>
      </div>
    </PageContent>
  );
}
