"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Dropdown } from "@/components/dropdown";
import { getAvatar } from "@/lib/avatars";
import { TOPICS, Topic, formatTopicLabel } from "@/lib/topics";

type LeaderboardEntry = {
  playerId: string;
  name: string;
  avatarId?: string;
  rating: number;
  topic: string;
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

        const response = await fetch(leaderboardUrl, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Failed to load leaderboard.");
        }

        const data = (await response.json()) as {
          leaderboard?: LeaderboardEntry[];
        };

        setEntries(data.leaderboard ?? []);
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

  return (
    <section className="w-full max-w-5xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-6 md:p-12">
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
              Competitive Rankings
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">Leaderboard</h1>
            <p className="text-slate-300">Top ratings persisted from completed matches.</p>
          </div>

          <div className="w-full max-w-xs space-y-2">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Filter Topic
            </span>
            <Dropdown
              aria-label="Filter leaderboard by topic"
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value as Topic | "all")}
              options={options}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/70">
          <div className="grid min-w-[320px] grid-cols-[44px_1fr_72px] gap-2 border-b border-slate-800 px-3 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 sm:grid-cols-[80px_1.5fr_140px_1fr] sm:gap-4 sm:px-6 sm:py-4">
            <span>Rank</span>
            <span>Player</span>
            <span>Rating</span>
            <span className="hidden sm:block">Topic</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center sm:px-6 text-slate-300">Loading leaderboard...</div>
          ) : error ? (
            <div className="px-4 py-8 text-center sm:px-6 text-rose-300">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-center sm:px-6 text-slate-300">No ratings yet. Play a few matches first.</div>
          ) : (
            <div>
              {entries.map((entry, index) => {
                const isTopThree = index < 3;

                return (
                  <div
                    key={`${entry.topic}-${entry.playerId}`}
                    className={`grid min-w-[320px] grid-cols-[44px_1fr_72px] gap-2 border-b border-slate-800/80 px-3 py-3 text-sm last:border-b-0 sm:grid-cols-[80px_1.5fr_140px_1fr] sm:gap-4 sm:px-6 sm:py-4 ${
                      isTopThree ? "bg-sky-500/5" : ""
                    }`}
                  >
                    <span className={`font-bold ${isTopThree ? "text-sky-300" : "text-slate-300"}`}>#{index + 1}</span>
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-white sm:gap-3">
                      <span className="text-xl leading-none sm:text-2xl">{getAvatar(entry.avatarId).icon}</span>
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="font-bold text-slate-100">{entry.rating}</span>
                    <span className="hidden text-slate-400 sm:block">{formatTopicLabel(entry.topic as Topic)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-start">
          <Button variant="secondary" onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </div>
      </div>
    </section>
  );
}
