"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { AVATARS, DEFAULT_AVATAR_ID, getAvatar, type AvatarId } from "@/lib/avatars";
import { getReadableAuthError, sanitizeDisplayName, validateDisplayName } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { formatTopicLabel, type Topic } from "@/lib/topics";

type ProfileResponse = {
  username?: string;
  displayName?: string;
  avatarId?: string;
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws?: number;
    winRate: number;
    highestRatedTopic: string | null;
    highestRating: number;
  };
  ratings: Array<{
    topic: string;
    rating: number;
  }>;
  matches: Array<{
    id: string;
    topic: string;
    opponentName: string;
    score: {
      you: number;
      opponent: number;
    };
    result: "win" | "loss" | "draw";
    ratingChange: number;
    createdAt: string;
  }>;
};

type PlayerQueryRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_id: string | null;
};

type RatingQueryRow = {
  topic: string;
  rating: number;
};

type MatchQueryRow = {
  id: string;
  topic: string;
  player1_id: string;
  player2_id: string;
  player1_score: number;
  player2_score: number;
  player1_rating_change: number | null;
  player2_rating_change: number | null;
  winner_player_id: string | null;
  created_at: string;
};

async function loadProfileFromSupabase(authUserId: string): Promise<ProfileResponse> {
  const supabase = getSupabaseClient();

  console.log("[profile] querying players by auth_user_id", { authUserId });
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, username, display_name, avatar_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (playerError) {
    console.error("[profile] players query failed", playerError);
    throw new Error("Unable to load your player profile from Supabase.");
  }

  const player = playerData as PlayerQueryRow | null;

  if (!player) {
    console.warn("[profile] no player row found for auth user", { authUserId });
    throw new Error("Your player profile has not been created yet.");
  }

  console.log("[profile] querying ratings", { playerId: player.id });
  const { data: ratings, error: ratingsError } = await supabase
    .from("ratings")
    .select("topic, rating")
    .eq("player_id", player.id)
    .order("rating", { ascending: false });

  if (ratingsError) {
    console.error("[profile] ratings query failed", ratingsError);
    throw new Error("Unable to load your ratings right now.");
  }

  console.log("[profile] querying matches", { playerId: player.id });
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(
      "id, topic, player1_id, player2_id, player1_score, player2_score, player1_rating_change, player2_rating_change, winner_player_id, created_at"
    )
    .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (matchesError) {
    console.error("[profile] matches query failed", matchesError);
    throw new Error("Unable to load your match history right now.");
  }

  const ratingRows = (ratings ?? []) as RatingQueryRow[];
  const matchRows = (matches ?? []) as MatchQueryRow[];
  const wins = matchRows.filter((match) => match.winner_player_id === player.id).length;
  const draws = matchRows.filter((match) => match.winner_player_id === null).length;
  const losses = matchRows.length - wins - draws;
  const sortedRatings = [...ratingRows].sort((left, right) => right.rating - left.rating);

  return {
    username: player.username,
    displayName: player.display_name ?? player.username,
    avatarId: player.avatar_id ?? DEFAULT_AVATAR_ID,
    summary: {
      totalMatches: matchRows.length,
      wins,
      losses,
      draws,
      winRate: matchRows.length > 0 ? Math.round((wins / matchRows.length) * 100) : 0,
      highestRatedTopic: sortedRatings[0]?.topic ?? null,
      highestRating: sortedRatings[0]?.rating ?? 1000
    },
    ratings: sortedRatings,
    matches: matchRows.map((match) => {
      const isPlayerOne = match.player1_id === player.id;

      return {
        id: match.id,
        topic: match.topic,
        opponentName: "Opponent",
        score: {
          you: isPlayerOne ? match.player1_score : match.player2_score,
          opponent: isPlayerOne ? match.player2_score : match.player1_score
        },
        result:
          match.winner_player_id === null
            ? "draw"
            : match.winner_player_id === player.id
              ? "win"
              : "loss",
        ratingChange: isPlayerOne
          ? match.player1_rating_change ?? 0
          : match.player2_rating_change ?? 0,
        createdAt: match.created_at
      };
    })
  };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export function ProfileClient() {
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [savingAvatarId, setSavingAvatarId] = useState<AvatarId | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const supabase = getSupabaseClient();
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError) {
          console.error("[profile] auth.getUser failed", userError);
          throw new Error("Unable to verify your signed-in session.");
        }

        if (!user) {
          router.push("/");
          return;
        }

        setAuthUserId(user.id);
        console.log("[profile] loading profile for user", { authUserId: user.id });
        const fallbackData = await loadProfileFromSupabase(user.id);
        setData(fallbackData);
        setDisplayNameInput(fallbackData.displayName ?? fallbackData.username ?? "");

        const {
          data: { session }
        } = await supabase.auth.getSession();
        const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL;

        if (!socketUrl || !session?.access_token) {
          console.warn("[profile] skipping backend profile enrichment", {
            hasSocketUrl: Boolean(socketUrl),
            hasAccessToken: Boolean(session?.access_token)
          });
          setWarning("Profile loaded, but recent opponent details are unavailable right now.");
          return;
        }

        const profileUrl = new URL("/profile", socketUrl);
        console.log("[profile] fetching enriched profile", {
          url: profileUrl.toString(),
          authUserId: user.id
        });

        let response: Response;

        try {
          response = await fetch(profileUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.access_token}`
            },
            signal: controller.signal,
            cache: "no-store"
          });
        } catch (networkError) {
          console.error("[profile] profile endpoint network error", networkError);
          setWarning("Profile loaded, but the game server could not be reached for full history details.");
          return;
        }

        if (response.status === 401) {
          router.push("/");
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[profile] profile endpoint error response", {
            status: response.status,
            body: errorText
          });
          setWarning("Profile loaded, but detailed match history could not be fetched from the server.");
          return;
        }

        const nextData = (await response.json()) as ProfileResponse;
        console.log("[profile] enriched profile loaded", {
          ratings: nextData.ratings.length,
          matches: nextData.matches.length
        });
        setData(nextData);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("[profile] failed to load profile", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "We couldn't load your profile right now."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      controller.abort();
    };
  }, [router]);

  const bestTopicLabel = useMemo(() => {
    if (!data?.summary.highestRatedTopic) {
      return "No matches yet";
    }

    return formatTopicLabel(data.summary.highestRatedTopic as Topic);
  }, [data?.summary.highestRatedTopic]);
  const currentAvatar = getAvatar(data?.avatarId);
  const totalMatches = data?.summary.totalMatches ?? 0;
  const currentDisplayName = data?.displayName ?? data?.username ?? "Profile";

  const handleAvatarSelect = async (avatarId: AvatarId) => {
    if (!authUserId || !data || savingAvatarId === avatarId || data.avatarId === avatarId) {
      return;
    }

    const previousAvatarId = data.avatarId ?? DEFAULT_AVATAR_ID;
    setAvatarError(null);
    setSavingAvatarId(avatarId);
    setData((current) => (current ? { ...current, avatarId } : current));

    try {
      const supabase = getSupabaseClient();
      console.log("[profile] updating avatar", { authUserId, avatarId });
      const { error: updateError } = await supabase
        .from("players")
        .update({ avatar_id: avatarId } as never)
        .eq("auth_user_id", authUserId);

      if (updateError) {
        console.error("[profile] avatar update failed", updateError);
        throw new Error("Unable to update your avatar right now.");
      }
    } catch (updateError) {
      setData((current) => (current ? { ...current, avatarId: previousAvatarId } : current));
      setAvatarError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update your avatar right now."
      );
    } finally {
      setSavingAvatarId(null);
    }
  };

  const handleDisplayNameSave = async () => {
    if (!authUserId || !data) {
      return;
    }

    const cleanDisplayName = sanitizeDisplayName(displayNameInput);
    const validationError = validateDisplayName(cleanDisplayName);

    if (validationError) {
      setDisplayNameError(validationError);
      return;
    }

    if (cleanDisplayName === currentDisplayName) {
      setDisplayNameError(null);
      return;
    }

    const previousDisplayName = currentDisplayName;
    setSavingDisplayName(true);
    setDisplayNameError(null);
    setData((current) =>
      current
        ? {
            ...current,
            displayName: cleanDisplayName,
            username: cleanDisplayName
          }
        : current
    );

    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase
        .from("players")
        .update({
          display_name: cleanDisplayName,
          username: cleanDisplayName
        } as never)
        .eq("auth_user_id", authUserId);

      if (updateError) {
        throw updateError;
      }
    } catch (updateError) {
      setData((current) =>
        current
          ? {
              ...current,
              displayName: previousDisplayName,
              username: previousDisplayName
            }
          : current
      );
      setDisplayNameInput(previousDisplayName);
      setDisplayNameError(
        updateError instanceof Error
          ? getReadableAuthError(updateError.message)
          : "Unable to update your display name right now."
      );
    } finally {
      setSavingDisplayName(false);
    }
  };

  return (
    <section className="w-full max-w-6xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-6 md:p-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
              Player Profile
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
              {loading ? "Loading..." : currentDisplayName}
            </h1>
            <p className="text-slate-300">
              Track your competitive progress, ratings, and recent matches.
            </p>
          </div>

          <Button variant="secondary" onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </div>

        {error ? (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-6 py-10 text-center text-rose-200">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 px-6 py-5 text-center text-amber-100">
            {warning}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Matches" value={loading ? "..." : data?.summary.totalMatches ?? 0} />
          <StatCard label="Wins" value={loading ? "..." : data?.summary.wins ?? 0} />
          <StatCard label="Losses" value={loading ? "..." : data?.summary.losses ?? 0} />
          <StatCard label="Win Rate" value={loading ? "..." : `${data?.summary.winRate ?? 0}%`} />
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Display Name</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{currentDisplayName}</h2>
              <p className="mt-1 text-sm text-slate-300">
                This is the name shown in matches, your profile, and the leaderboard.
              </p>
            </div>

            <div className="w-full max-w-md space-y-3">
              <input
                type="text"
                value={displayNameInput}
                maxLength={16}
                onChange={(event) => {
                  setDisplayNameInput(sanitizeDisplayName(event.target.value));
                  setDisplayNameError(null);
                }}
                placeholder="Update your display name"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
              />
              <Button
                className="w-full"
                onClick={() => void handleDisplayNameSave()}
                disabled={savingDisplayName || loading}
              >
                {savingDisplayName ? "Saving..." : "Save Display Name"}
              </Button>
              {displayNameError ? <p className="text-sm text-rose-300">{displayNameError}</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-sky-400/20 bg-slate-950/80 text-5xl shadow-glow">
                {currentAvatar.icon}
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Choose Avatar</p>
                <h2 className="mt-2 text-2xl font-bold text-white">{currentAvatar.name}</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Pick the character that represents you in matches, the leaderboard, and your profile.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {AVATARS.map((avatar) => {
                const isSelected = (data?.avatarId ?? DEFAULT_AVATAR_ID) === avatar.id;
                const isSaving = savingAvatarId === avatar.id;

                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => void handleAvatarSelect(avatar.id)}
                    disabled={loading || Boolean(savingAvatarId)}
                    className={`rounded-2xl border px-4 py-4 text-center transition ${
                      isSelected
                        ? "border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/35 shadow-glow"
                        : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <div className="text-3xl">{avatar.icon}</div>
                    <p className="mt-2 text-sm font-semibold text-white">{avatar.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {isSaving ? "Saving..." : isSelected ? "Selected" : "Choose"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {avatarError ? (
            <p className="mt-4 text-sm text-rose-300">{avatarError}</p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Ratings</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Current Ratings</h2>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Best Topic</p>
                <p className="mt-1 text-sm font-semibold text-sky-300">{bestTopicLabel}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {(data?.ratings ?? []).map((entry, index) => {
                const isBest = index === 0 && totalMatches > 0;

                return (
                  <div
                    key={entry.topic}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-4 ${
                      isBest
                        ? "border-sky-400/30 bg-sky-500/10"
                        : "border-slate-800 bg-slate-950/70"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {formatTopicLabel(entry.topic as Topic)}
                      </p>
                      {isBest ? (
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-sky-300">
                          Highest Rated Topic
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xl font-black text-white">{entry.rating}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Match History</p>
              <h2 className="text-2xl font-bold text-white">Recent Matches</h2>
            </div>

            <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/60">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-[1.1fr_1fr_110px_110px_1fr] gap-3 border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <span>Topic</span>
                  <span>Opponent</span>
                  <span>Score</span>
                  <span>Result</span>
                  <span>When</span>
                </div>

                {loading ? (
                  <div className="px-5 py-10 text-center text-slate-300">Loading profile...</div>
                ) : data && data.matches.length > 0 ? (
                  data.matches.map((match) => (
                    <div
                      key={match.id}
                      className="grid grid-cols-[1.1fr_1fr_110px_110px_1fr] gap-3 border-b border-slate-800/80 px-5 py-4 text-sm last:border-b-0"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {formatTopicLabel(match.topic as Topic)}
                        </p>
                        <p
                          className={`mt-1 text-xs font-semibold ${
                            match.ratingChange >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {match.ratingChange >= 0 ? "+" : ""}
                          {match.ratingChange} rating
                        </p>
                      </div>
                      <span className="text-slate-200">{match.opponentName}</span>
                      <span className="font-semibold text-white">
                        {match.score.you} - {match.score.opponent}
                      </span>
                      <span
                        className={`font-semibold ${
                          match.result === "win" ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {match.result === "win" ? "Win" : "Loss"}
                      </span>
                      <span className="text-slate-400">
                        {new Date(match.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center text-slate-300">
                    No completed matches yet. Jump into a game and your history will show up here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
