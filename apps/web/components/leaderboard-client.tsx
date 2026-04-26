"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Dropdown } from "@/components/dropdown";
import { RankBadge } from "@/components/rank-badge";
import { ProfileIconBadge } from "@/components/profile-icon-badge";
import { getSupabaseClient } from "@/lib/supabase";
import { TOPICS, Topic, formatTopicLabel } from "@/lib/topics";
import { PageContent } from "@/components/page-content";
import type { ProfileIconMode } from "@/lib/profile-icon";

type LeaderboardEntry = {
  rank: number;
  playerId: string;
  name: string;
  profileIconMode?: ProfileIconMode | string;
  profileIconEmoji?: string | null;
  profileIconText?: string | null;
  profileIconImageUrl?: string | null;
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
    <PageContent size="wide" variant="plain" className="w-full min-w-0 space-y-6">
      <div className="flex min-w-0 flex-col gap-8 sm:gap-10">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <span className="neon-badge inline-flex rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]">
              Competitive Rankings
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">Leaderboard</h1>
            <p className="max-w-xl text-base leading-relaxed text-textSecondary">
              Live standings for named accounts. Guest practice accounts are hidden.
            </p>
          </div>

          <div className="w-full min-w-0 max-w-full space-y-2 md:max-w-xs">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-200/85">Filter Topic</span>
            <Dropdown
              aria-label="Filter leaderboard by topic"
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value as Topic | "all")}
              options={options}
            />
          </div>
        </div>

        <div className="neon-panel-soft overflow-hidden rounded-3xl">
          <div className="hidden grid-cols-[68px_1fr_96px_1fr] gap-4 border-b border-white/10 bg-slate-950/55 px-6 py-4 text-xs font-bold uppercase tracking-[0.25em] text-slate-200/90 sm:grid">
            <span>#</span>
            <span>Player</span>
            <span>Rating</span>
            <span>Topic</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-slate-200/90 sm:px-6">Loading leaderboard...</div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-rose-200 sm:px-6">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-200/88 sm:px-6">No ratings yet. Play a few matches first.</div>
          ) : (
            <div>
              {entries.map((entry, index) => {
                const isTopThree = index < 3;
                const isCurrentUser = myRank?.playerId === entry.playerId;
                const rowTint = isCurrentUser
                  ? "bg-cyan-400/[0.12] ring-1 ring-inset ring-cyan-300/20"
                  : isTopThree
                    ? "bg-indigo-500/[0.08]"
                    : "bg-slate-950/35";

                return (
                  <div key={entry.playerId} className={`border-b border-white/10 last:border-b-0 ${rowTint}`}>
                    <div className="q-row-hover flex items-start gap-3 px-4 py-4 sm:hidden">
                      <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/70 px-2 py-2">
                        <span className={`text-lg font-black tabular-nums ${isTopThree ? "text-cyan-100" : "text-slate-200/90"}`}>
                          {entry.rank}
                        </span>
                        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400/85">Rank</span>
                      </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-3">
                          <ProfileIconBadge
                            icon={entry}
                            fallbackName={entry.name}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-semibold text-white">{entry.name}</span>
                              {isCurrentUser ? (
                                <span className="shrink-0 rounded-full border border-cyan-300/45 bg-cyan-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
                                  You
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1">
                              <RankBadge rating={entry.rating} size="sm" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/85">Rating</p>
                            <p className="mt-1 font-bold tabular-nums text-white">{entry.rating}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/85">Topic</p>
                            <p className="mt-1 font-medium text-slate-200/90">{formatTopicLabel(entry.topic as Topic)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden grid-cols-[68px_1fr_96px_1fr] items-center gap-4 px-6 py-4 text-sm sm:grid">
                      <span className={`text-sm font-bold tabular-nums ${isTopThree ? "text-cyan-100" : "text-slate-300"}`}>
                        {entry.rank}
                      </span>

                      <span className="flex min-w-0 items-center gap-2.5">
                        <ProfileIconBadge
                          icon={entry}
                          fallbackName={entry.name}
                          size="sm"
                          className="shrink-0"
                        />
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

                      <span className="font-bold tabular-nums text-white">{entry.rating}</span>
                      <span className="font-medium text-slate-200/90">{formatTopicLabel(entry.topic as Topic)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showMyRankCard && myRank ? (
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/[0.1] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-100">Your Standing</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-black tabular-nums text-cyan-100">#{myRank.rank}</span>
              <ProfileIconBadge icon={myRank} fallbackName={myRank.name} size="sm" />
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

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-start sm:gap-3">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => router.push("/")}>
            Back to Home
          </Button>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => router.push("/profile")}>
            Profile
          </Button>
        </div>
      </div>
    </PageContent>
  );
}
