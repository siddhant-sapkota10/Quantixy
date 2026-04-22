"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { ProfileCharacterSelector } from "@/components/profile-character-selector";
import { DEFAULT_AVATAR_ID, getAvatar, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { ensurePlayerProfileForUser, getReadableAuthError, sanitizeDisplayName, validateDisplayName } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { PurchaseSuccessModal } from "@/components/PurchaseSuccessModal";
import { getPremiumItem, type PremiumItem, type PremiumItemType } from "@/lib/premium-items";
import { formatTopicLabel, type Topic } from "@/lib/topics";
import { PageContent } from "@/components/page-content";
import {
  EMOTE_PACKS,
  normalizeStreakEffectId,
  normalizeEmotePackId,
  type EmotePackId,
} from "@/lib/cosmetics";
import { getRankFromRating, getNextRankInfo } from "@/lib/ranks";
import { RankBadge } from "@/components/rank-badge";
import { EMOTES } from "@/lib/emotes";

type ProfileResponse = {
  username?: string;
  displayName?: string;
  avatarId?: string;
  streakEffect?: string;
  emotePack?: string;
  ownedEmotePacks?: string[];
  ownedAvatars?: string[];
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
  avatar: string | null;
};

type CosmeticQueryRow = {
  streak_effect: string | null;
  emote_pack: string | null;
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

type OpponentQueryRow = {
  id: string;
  username: string;
  display_name: string | null;
};

function deriveResultFromScores(yourScore: number, opponentScore: number): "win" | "loss" | "draw" {
  if (yourScore > opponentScore) return "win";
  if (yourScore < opponentScore) return "loss";
  return "draw";
}

async function loadProfileFromSupabase(authUserId: string): Promise<ProfileResponse> {
  const supabase = getSupabaseClient();

  console.log("[profile] querying players by auth_user_id", { authUserId });
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, username, display_name, avatar")
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

  // Cosmetic columns are fetched separately so the profile page loads even if
  // the DB migration has not been applied yet (columns missing → safe defaults).
  let streakEffect = "none";
  let emotePack = "starter";
  let ownedEmotePacks: string[] = ["starter"];
  const { data: cosmeticData, error: cosmeticError } = await supabase
    .from("players")
    .select("streak_effect, emote_pack")
    .eq("id", player.id)
    .maybeSingle();
  if (!cosmeticError && cosmeticData) {
    const cosRow = cosmeticData as CosmeticQueryRow;
    streakEffect = normalizeStreakEffectId(cosRow.streak_effect);
    emotePack = normalizeEmotePackId(cosRow.emote_pack);
  }

  // Owned packs are sourced from user_emote_packs (written by Stripe webhook).
  try {
    const { data: ownedRows, error: ownedError } = await supabase
      .from("user_emote_packs")
      .select("pack_id")
      .eq("user_id", authUserId);
    if (!ownedError && Array.isArray(ownedRows)) {
      const rows = ownedRows as Array<{ pack_id: string }>;
      ownedEmotePacks = Array.from(new Set(["starter", ...rows.map((r) => r.pack_id)]));
    }
  } catch {
    // If table/migration not applied yet, fall back to starter-only.
  }

  // Owned avatars (premium) are sourced from user_avatars (auth user id, lowercase avatar_id).
  // Free avatars are always considered owned in the UI.
  const premiumAvatarIds = new Set<string>(["architect", "titan"]);
  let ownedAvatars: string[] = [];
  try {
    const { data: ownedRows, error: ownedError } = await supabase
      .from("user_avatars")
      .select("avatar_id")
      .eq("user_id", authUserId);
    if (ownedError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[profile] user_avatars query failed (check RLS and table):", ownedError.message);
      }
    } else if (Array.isArray(ownedRows)) {
      const rows = ownedRows as Array<{ avatar_id: string }>;
      ownedAvatars = Array.from(
        new Set(
          rows
            .map((r) => normalizeAvatarId(r.avatar_id))
            .filter((id) => premiumAvatarIds.has(id))
        )
      );
    }
  } catch {
    // If table/migration not applied yet, fall back to free-only.
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
  const opponentIds = [
    ...new Set(
      matchRows.map((match) => (match.player1_id === player.id ? match.player2_id : match.player1_id))
    )
  ];
  let opponentNameMap = new Map<string, string>();

  if (opponentIds.length > 0) {
    const { data: opponents, error: opponentsError } = await supabase
      .from("players")
      .select("id, username, display_name")
      .in("id", opponentIds);

    if (opponentsError) {
      console.error("[profile] opponents query failed", opponentsError);
    } else {
      opponentNameMap = new Map(
        ((opponents ?? []) as OpponentQueryRow[]).map((opponent) => [
          opponent.id,
          opponent.display_name ?? opponent.username
        ])
      );
    }
  }

  const results = matchRows.map((match) =>
    deriveResultFromScores(
      match.player1_id === player.id ? match.player1_score : match.player2_score,
      match.player1_id === player.id ? match.player2_score : match.player1_score
    )
  );
  const wins = results.filter((result) => result === "win").length;
  const draws = results.filter((result) => result === "draw").length;
  const losses = results.filter((result) => result === "loss").length;
  const sortedRatings = [...ratingRows].sort((left, right) => right.rating - left.rating);

  return {
    username: player.username,
    displayName: player.display_name ?? player.username,
    avatarId: normalizeAvatarId(player.avatar),
    streakEffect,
    emotePack,
    ownedEmotePacks,
    ownedAvatars,
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
      const opponentId = isPlayerOne ? match.player2_id : match.player1_id;
      const yourScore = isPlayerOne ? match.player1_score : match.player2_score;
      const opponentScore = isPlayerOne ? match.player2_score : match.player1_score;

      return {
        id: match.id,
        topic: match.topic,
        opponentName: opponentNameMap.get(opponentId) ?? "Opponent",
        score: {
          you: yourScore,
          opponent: opponentScore
        },
        result: deriveResultFromScores(yourScore, opponentScore),
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
    <div className="q-card rounded-2xl px-4 py-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400/70">{label}</p>
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
  const displayNameInputRef = useRef<HTMLInputElement | null>(null);
  const [savingAvatarId, setSavingAvatarId] = useState<AvatarId | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [previewAvatarId, setPreviewAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [savingEmotePack, setSavingEmotePack] = useState<EmotePackId | null>(null);
  const [emotePackError, setEmotePackError] = useState<string | null>(null);
  const [buyingPack, setBuyingPack] = useState<EmotePackId | null>(null);
  const [emoteShopError, setEmoteShopError] = useState<string | null>(null);
  const [navPending, setNavPending] = useState(false);
  const [selectedRatingTopic, setSelectedRatingTopic] = useState<string | null>(null);
  const [selectedMatchTopic, setSelectedMatchTopic] = useState<"all" | string>("all");

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseConfirming, setPurchaseConfirming] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<PremiumItem | null>(null);

  const refreshProfile = async (authId: string) => {
    const next = await loadProfileFromSupabase(authId);
    setData((current) => (current ? { ...current, ...next } : next));
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const supabase = getSupabaseClient();
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("[profile] auth.getSession failed, redirecting home", sessionError);
          router.push("/");
          return;
        }

        const user = session?.user ?? null;
        if (!user) {
          router.push("/");
          return;
        }

        setAuthUserId(user.id);
        try {
          await ensurePlayerProfileForUser(user);
        } catch (profileEnsureError) {
          console.warn("[profile] ensurePlayerProfileForUser failed", profileEnsureError);
        }
        console.log("[profile] loading profile for user", { authUserId: user.id });
        const fallbackData = await loadProfileFromSupabase(user.id);
        setData(fallbackData);
        setDisplayNameInput(fallbackData.displayName ?? fallbackData.username ?? "");

        const {
          data: { session: authSession }
        } = await supabase.auth.getSession();
        const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL;

        if (!socketUrl || !authSession?.access_token) {
          console.warn("[profile] skipping backend profile enrichment", {
            hasSocketUrl: Boolean(socketUrl),
            hasAccessToken: Boolean(authSession?.access_token)
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
              Authorization: `Bearer ${authSession.access_token}`
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
        nextData.avatarId = normalizeAvatarId(nextData.avatarId);
        nextData.streakEffect = normalizeStreakEffectId(nextData.streakEffect);
        nextData.emotePack = normalizeEmotePackId(nextData.emotePack);
        console.log("[profile] enriched profile loaded", {
          ratings: nextData.ratings.length,
          matches: nextData.matches.length
        });
        // Source of truth for paid ownership is Supabase (`user_emote_packs`, `user_avatars`).
        // The game server "enriched profile" payload does not include those lists, so preserve
        // them from the initial Supabase load to avoid UI flicker back to Locked.
        setData({
          ...nextData,
          ownedEmotePacks:
            Array.isArray(nextData.ownedEmotePacks) && nextData.ownedEmotePacks.length > 0
              ? nextData.ownedEmotePacks
              : fallbackData.ownedEmotePacks,
          ownedAvatars:
            Array.isArray(nextData.ownedAvatars) && nextData.ownedAvatars.length > 0
              ? nextData.ownedAvatars
              : (fallbackData.ownedAvatars ?? []),
        });
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

  useEffect(() => {
    if (!authUserId || loading || !data) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const onboarding = params.get("onboarding");
    if (onboarding !== "display_name") return;

    // Nudge user to pick a name immediately after OAuth/email signup/login.
    setWarning("Pick a display name to finish setting up your account.");

    window.setTimeout(() => {
      displayNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      displayNameInputRef.current?.focus();
    }, 50);
  }, [authUserId, data, loading]);

  // Post-purchase UX: confirm session, refresh ownership instantly, then show premium unlock modal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    const sessionId = params.get("session_id");
    if (!purchase || purchase !== "success" || !sessionId) return;
    if (!authUserId) return;

    let cancelled = false;
    const run = async () => {
      setPurchaseModalOpen(true);
      setPurchaseConfirming(true);
      setPurchaseError(null);
      setPurchaseItem(null);
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("You are not signed in.");
        }

        const response = await fetch("/api/stripe/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId }),
        });
        const payload = (await response.json()) as
          | { status: "pending" }
          | { status: "confirmed"; itemType: PremiumItemType; itemId: string }
          | { error: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Unable to confirm purchase.");
        }

        if ("status" in payload && payload.status === "pending") {
          throw new Error("Payment is still processing. Please wait a moment and refresh your profile.");
        }

        const confirmed = payload as { status: "confirmed"; itemType: PremiumItemType; itemId: string };
        const item = getPremiumItem(confirmed.itemType, confirmed.itemId);
        if (item) {
          setPurchaseItem(item);
        }

        await refreshProfile(authUserId);
      } catch (e) {
        setPurchaseError(e instanceof Error ? e.message : "Unable to confirm purchase.");
      } finally {
        if (!cancelled) {
          setPurchaseConfirming(false);
          // Clean URL so the modal doesn't re-open on future visits.
          router.replace("/profile");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [authUserId, router]);

  const bestTopicLabel = useMemo(() => {
    if (!data?.summary.highestRatedTopic) {
      return "No matches yet";
    }

    return formatTopicLabel(data.summary.highestRatedTopic as Topic);
  }, [data?.summary.highestRatedTopic]);
  const ratingsList = data?.ratings ?? [];
  const selectedRatingEntry = useMemo(() => {
    if (ratingsList.length === 0) {
      return null;
    }

    return ratingsList.find((entry) => entry.topic === selectedRatingTopic) ?? ratingsList[0];
  }, [ratingsList, selectedRatingTopic]);
  const selectedRatingLabel = selectedRatingEntry
    ? formatTopicLabel(selectedRatingEntry.topic as Topic)
    : "No topic selected";
  const selectedRatingValue = selectedRatingEntry?.rating ?? data?.summary.highestRating ?? 1000;

  useEffect(() => {
    if (ratingsList.length === 0) {
      setSelectedRatingTopic(null);
      return;
    }

    const hasSelectedTopic = selectedRatingTopic
      ? ratingsList.some((entry) => entry.topic === selectedRatingTopic)
      : false;

    if (!hasSelectedTopic) {
      setSelectedRatingTopic(data?.summary.highestRatedTopic ?? ratingsList[0].topic);
    }
  }, [data?.summary.highestRatedTopic, ratingsList, selectedRatingTopic]);

  const matchTopicOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const match of data?.matches ?? []) {
      seen.add(match.topic);
    }

    return [...seen].sort((left, right) =>
      formatTopicLabel(left as Topic).localeCompare(formatTopicLabel(right as Topic))
    );
  }, [data?.matches]);
  const filteredMatches = useMemo(() => {
    const matches = data?.matches ?? [];
    if (selectedMatchTopic === "all") {
      return matches;
    }

    return matches.filter((match) => match.topic === selectedMatchTopic);
  }, [data?.matches, selectedMatchTopic]);

  useEffect(() => {
    if (selectedMatchTopic === "all") {
      return;
    }

    if (!matchTopicOptions.includes(selectedMatchTopic)) {
      setSelectedMatchTopic("all");
    }
  }, [matchTopicOptions, selectedMatchTopic]);

  const selectedAvatarId = normalizeAvatarId(data?.avatarId);
  useEffect(() => {
    setPreviewAvatarId(selectedAvatarId);
  }, [selectedAvatarId]);
  const currentAvatar = getAvatar(previewAvatarId);
  const totalMatches = data?.summary.totalMatches ?? 0;
  const currentDisplayName = data?.displayName ?? data?.username ?? "Profile";

  const handleAvatarSelect = async (avatarId: AvatarId) => {
    if (!authUserId || !data || savingAvatarId === avatarId || data.avatarId === avatarId) {
      return;
    }

    // Premium avatar guard (no payment flow here — selection requires ownership).
    const freeAvatarIds = new Set(["flash", "shadow", "guardian", "inferno"]);
    const owned = new Set([...(data.ownedAvatars ?? []), ...Array.from(freeAvatarIds)]);
    const selectingPremium = avatarId === "architect" || avatarId === "titan";
    if (selectingPremium && !owned.has(avatarId)) {
      const label = avatarId === "titan" ? "Titan" : "Architect";
      setAvatarError(`${label} is a premium character and is currently locked on your account.`);
      return;
    }

    const previousAvatarId = normalizeAvatarId(data.avatarId);
    setAvatarError(null);
    setSavingAvatarId(avatarId);
    setData((current) => (current ? { ...current, avatarId } : current));

    try {
      const supabase = getSupabaseClient();
      console.log("[profile] updating avatar", { authUserId, avatarId });
      const { error: updateError } = await supabase
        .from("players")
        .update({ avatar: avatarId } as never)
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

  const selectedEmotePack = normalizeEmotePackId(data?.emotePack);
  const ownedEmotePacks = new Set((data?.ownedEmotePacks ?? ["starter"]).map(String));
  const isPackOwned = (packId: EmotePackId) => packId === "starter" || ownedEmotePacks.has(packId);
  const ownedAvatars = new Set((data?.ownedAvatars ?? []).map(String));
  const isAvatarOwned = (avatarId: "architect" | "titan") => ownedAvatars.has(avatarId);

  const handleEmotePackSelect = async (packId: EmotePackId) => {
    if (!authUserId || !data || savingEmotePack || data.emotePack === packId) return;
    if (!isPackOwned(packId)) {
      setEmotePackError("That emote pack is locked. Purchase it in the Emote Shop first.");
      return;
    }

    const previousPack = data.emotePack;
    setEmotePackError(null);
    setSavingEmotePack(packId);
    setData((current) => (current ? { ...current, emotePack: packId } : current));

    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase
        .from("players")
        .update({ emote_pack: packId } as never)
        .eq("auth_user_id", authUserId);

      if (updateError) throw new Error("Unable to update emote pack.");
    } catch (updateError) {
      setData((current) => (current ? { ...current, emotePack: previousPack } : current));
      setEmotePackError(
        updateError instanceof Error ? updateError.message : "Unable to update emote pack."
      );
    } finally {
      setSavingEmotePack(null);
    }
  };

  const handleBuyEmotePack = async (packId: EmotePackId) => {
    setEmoteShopError(null);
    if (packId === "starter") return;
    if (buyingPack) return;
    if (!data) return;

    const supabase = getSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setEmoteShopError("You must be signed in to purchase emote packs.");
      return;
    }

    if (session.user?.is_anonymous) {
      setEmoteShopError("Guest accounts cannot make purchases. Sign in with a real account to buy packs.");
      return;
    }

    setBuyingPack(packId);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pack: packId }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }

      window.location.href = payload.url;
    } catch (buyError) {
      setEmoteShopError(buyError instanceof Error ? buyError.message : "Unable to start checkout.");
    } finally {
      setBuyingPack(null);
    }
  };

  const [buyingAvatar, setBuyingAvatar] = useState<"architect" | "titan" | null>(null);
  const [avatarShopError, setAvatarShopError] = useState<string | null>(null);

  const handleBuyAvatar = async (avatarId: "architect" | "titan") => {
    setAvatarShopError(null);
    if (buyingAvatar) return;
    if (!data) return;
    if (isAvatarOwned(avatarId)) return;

    const supabase = getSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setAvatarShopError("You must be signed in to purchase premium characters.");
      return;
    }

    if (session.user?.is_anonymous) {
      setAvatarShopError("Guest accounts cannot make purchases. Sign in with a real account to buy characters.");
      return;
    }

    setBuyingAvatar(avatarId);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ itemType: "avatar", itemId: avatarId }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }

      window.location.href = payload.url;
    } catch (buyError) {
      setAvatarShopError(buyError instanceof Error ? buyError.message : "Unable to start checkout.");
    } finally {
      setBuyingAvatar(null);
    }
  };

  return (
    <PageContent size="xl" variant="plain" className="w-full min-w-0 space-y-6 sm:space-y-8 md:space-y-10">
      <PurchaseSuccessModal
        open={purchaseModalOpen}
        item={purchaseItem}
        confirming={purchaseConfirming}
        error={purchaseError}
        onContinue={() => setPurchaseModalOpen(false)}
        onEquipNow={
          purchaseItem?.equipAction
            ? () => {
                if (!purchaseItem) return;
                if (purchaseItem.equipAction === "equip_avatar") {
                  void handleAvatarSelect(purchaseItem.id as AvatarId);
                  setPurchaseModalOpen(false);
                  return;
                }
                if (purchaseItem.equipAction === "equip_emote_pack") {
                  void handleEmotePackSelect(purchaseItem.id as EmotePackId);
                  setPurchaseModalOpen(false);
                }
              }
            : undefined
        }
      />
      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
              Player Profile
            </span>
            <h1 className="break-words text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
              {loading ? "Loading..." : currentDisplayName}
            </h1>
            <p className="text-slate-300">
              Track your competitive progress, ratings, and recent matches.
            </p>
          </div>

          <Button
            variant="secondary"
            className="w-full shrink-0 md:w-auto"
            onClick={() => {
              setNavPending(true);
              router.push("/");
            }}
            loading={navPending}
            loadingText="Opening..."
          >
            Back to Home
          </Button>
        </div>

        {error ? (
          <div className="q-card rounded-3xl px-6 py-10 text-center text-rose-200">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="q-card rounded-3xl px-6 py-5 text-center text-amber-100">
            {warning}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Matches" value={loading ? "..." : data?.summary.totalMatches ?? 0} />
          <StatCard label="Wins" value={loading ? "..." : data?.summary.wins ?? 0} />
          <StatCard label="Losses" value={loading ? "..." : data?.summary.losses ?? 0} />
          <StatCard label="Win Rate" value={loading ? "..." : `${data?.summary.winRate ?? 0}%`} />
        </div>

        <div className="q-card-strong rounded-3xl p-4 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400/70">Display Name</p>
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
                ref={displayNameInputRef}
                onChange={(event) => {
                  setDisplayNameInput(sanitizeDisplayName(event.target.value));
                  setDisplayNameError(null);
                }}
                placeholder="Update your display name"
                className="w-full neon-input rounded-2xl px-4 py-3 text-slate-100"
              />
              <Button
                className="w-full"
                onClick={() => void handleDisplayNameSave()}
                disabled={savingDisplayName || loading}
                loading={savingDisplayName}
                loadingText="Saving..."
              >
                Save Display Name
              </Button>
              {displayNameError ? <p className="text-sm text-rose-300">{displayNameError}</p> : null}
            </div>
          </div>
        </div>

        <div>
          <ProfileCharacterSelector
            selectedId={selectedAvatarId}
            previewId={previewAvatarId}
            savingId={savingAvatarId}
            disabled={loading || Boolean(savingAvatarId)}
            ownedAvatarIds={[
              ...(data?.ownedAvatars ?? []).map((id) => normalizeAvatarId(id)),
              "flash",
              "shadow",
              "guardian",
              "inferno",
            ]}
            onBuyPremiumAvatar={(avatarId) => void handleBuyAvatar(avatarId)}
            onPreviewChange={setPreviewAvatarId}
            onSelect={(avatarId) => void handleAvatarSelect(avatarId)}
          />
          {avatarError ? <p className="mt-4 text-sm text-rose-300">{avatarError}</p> : null}
        </div>

        {/* Cosmetics */}
        <div className="q-card-strong rounded-3xl p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.3em] text-violet-300">
                Cosmetics
              </span>
              <h2 className="text-2xl font-bold text-white">Emote Packs</h2>
              <p className="max-w-2xl text-sm text-slate-400">
                Pick the quick-send messages you want in matches. Starter is free; premium packs can be bought and equipped here.
              </p>
            </div>
            <span className="w-fit rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">
              Stripe Checkout
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {EMOTE_PACKS.map((pack) => {
              const packId = pack.id as EmotePackId;
              const selected = selectedEmotePack === packId;
              const owned = pack.unlockedByDefault || isPackOwned(packId);
              const locked = !owned;
              const buying = buyingPack === packId;
              const saving = savingEmotePack === packId;

              return (
                <div
                  key={pack.id}
                  className={`relative flex min-h-[15rem] flex-col rounded-2xl border p-4 transition ${
                    selected
                      ? "border-cyan-300/35 bg-cyan-400/[0.08] shadow-[0_0_28px_rgba(34,211,238,0.10),inset_0_1px_0_rgba(34,211,238,0.08)]"
                      : locked
                        ? "q-card-subtle"
                        : "q-card-subtle"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{pack.name}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{pack.description}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                        selected
                          ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200"
                          : owned
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                            : "border-amber-400/25 bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      {selected ? "Equipped" : owned ? "Owned" : "Locked"}
                    </span>
                  </div>

                  <div className="q-card-subtle mt-4 rounded-2xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500/70">Preview</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pack.emoteIds.map((emoteId) => {
                        const emote = EMOTES.find((e) => e.id === emoteId);
                        return emote ? (
                          <span
                            key={`${pack.id}-${emoteId}`}
                            title={emote.label}
                            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200/85"
                          >
                            <span>{emote.icon}</span>
                            <span>{emote.label}</span>
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="mt-auto pt-4">
                    {locked ? (
                      <Button
                        className="w-full"
                        disabled={loading || buying}
                        loading={buying}
                        loadingText="Starting..."
                        onClick={() => void handleBuyEmotePack(packId)}
                      >
                        Buy
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant={selected ? "secondary" : "primary"}
                        disabled={loading || Boolean(savingEmotePack) || selected}
                        loading={saving}
                        loadingText="Equipping..."
                        onClick={() => void handleEmotePackSelect(packId)}
                      >
                        {selected ? "Equipped" : "Equip"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {emotePackError ? <p className="mt-3 text-sm text-rose-300">{emotePackError}</p> : null}
          {emoteShopError ? <p className="mt-3 text-sm text-rose-300">{emoteShopError}</p> : null}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="q-card-strong rounded-3xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400/70">Ratings</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Current Ratings</h2>
                <div className="mt-1 flex items-center gap-2">
                  <RankBadge rating={selectedRatingValue} size="md" />
                  <p className="text-sm text-slate-400">
                    Viewing <span className="font-semibold text-white">{selectedRatingValue}</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Selected Topic</p>
                <p className="mt-1 text-sm font-semibold text-sky-300">{selectedRatingLabel}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Best: {bestTopicLabel}
                </p>
              </div>
            </div>

            {/* Rank progress toward next tier */}
            {(() => {
              const topicRating = selectedRatingValue;
              const { nextRank, progress, pointsNeeded } = getNextRankInfo(topicRating);
              const currentRank = getRankFromRating(topicRating);
              if (!nextRank) {
                return (
                  <div className="q-card-subtle mt-4 flex items-center gap-2.5 rounded-2xl px-4 py-3">
                    <RankBadge rank={currentRank} size="md" />
                    <p className="text-xs font-semibold text-pink-200">
                      Max rank — you&apos;ve reached the top.
                    </p>
                  </div>
                );
              }
              return (
                <div className="q-card-subtle mt-4 rounded-3xl px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Current Rank</p>
                      <div className="flex items-center gap-2">
                        <RankBadge rank={currentRank} size="sm" />
                        <span className="text-sm font-black tabular-nums text-white">{topicRating}</span>
                      </div>
                    </div>
                    <div className="space-y-1 text-left sm:text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Next Rank</p>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <span className="text-xs font-semibold tabular-nums text-cyan-200">{pointsNeeded} pts away</span>
                        <RankBadge rank={nextRank} size="sm" />
                      </div>
                    </div>
                  </div>
                  {/* Progress track */}
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-950/70 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${nextRank.progressClass}`}
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <span>{currentRank.name}</span>
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                    <span>{nextRank.name}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 space-y-3">
              {ratingsList.map((entry, index) => {
                const isBest = index === 0 && totalMatches > 0;
                const isSelected = selectedRatingEntry?.topic === entry.topic;
                const entryRank = getRankFromRating(entry.rating);

                return (
                  <button
                    key={entry.topic}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedRatingTopic(entry.topic)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                      isSelected
                        ? "border-cyan-300/35 bg-cyan-400/[0.09] shadow-[0_0_24px_rgba(34,211,238,0.09),inset_0_1px_0_rgba(34,211,238,0.07)]"
                        : isBest
                          ? "border-sky-400/25 bg-sky-500/[0.07] hover:border-sky-300/35 hover:bg-sky-500/[0.10]"
                          : "border-slate-500/20 bg-slate-950/45 hover:border-slate-400/35 hover:bg-slate-900/60"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {formatTopicLabel(entry.topic as Topic)}
                      </p>
                      <p
                        className={`mt-1 text-xs uppercase tracking-[0.2em] ${
                          isSelected ? "text-cyan-200" : isBest ? "text-sky-300" : "text-slate-500"
                        }`}
                      >
                        {isSelected ? "Viewing Rank Progress" : isBest ? "Highest Rated Topic" : "Select Topic"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RankBadge rank={entryRank} size="md" />
                      <p className="text-xl font-black text-white">{entry.rating}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="q-card-strong rounded-3xl p-4 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400/70">Match History</p>
                <h2 className="text-2xl font-bold text-white">Recent Matches</h2>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  aria-pressed={selectedMatchTopic === "all"}
                  onClick={() => setSelectedMatchTopic("all")}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                    selectedMatchTopic === "all"
                      ? "border-cyan-300/35 bg-cyan-400/[0.10] text-cyan-100"
                      : "border-slate-500/20 bg-slate-950/45 text-slate-400/80 hover:border-slate-400/35 hover:text-slate-200"
                  }`}
                >
                  All
                </button>
                {matchTopicOptions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={selectedMatchTopic === topic}
                    onClick={() => setSelectedMatchTopic(topic)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                      selectedMatchTopic === topic
                        ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-100"
                        : "border-slate-500/20 bg-slate-950/45 text-slate-400 hover:border-slate-400/35 hover:text-slate-200"
                    }`}
                  >
                    {formatTopicLabel(topic as Topic)}
                  </button>
                ))}
              </div>
            </div>

            <div className="q-card-subtle mt-6 overflow-x-auto rounded-3xl">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-[1.1fr_1fr_110px_110px_1fr] gap-3 border-b border-white/[0.06] px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400/60">
                  <span>Topic</span>
                  <span>Opponent</span>
                  <span>Score</span>
                  <span>Result</span>
                  <span>When</span>
                </div>

                {loading ? (
                  <div className="px-5 py-10 text-center text-slate-300">Loading profile...</div>
                ) : data && filteredMatches.length > 0 ? (
                  filteredMatches.map((match) => (
                    <div
                      key={match.id}
                      className="q-row-hover grid grid-cols-[1.1fr_1fr_110px_110px_1fr] gap-3 border-b border-white/[0.045] px-5 py-4 text-sm last:border-b-0"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {formatTopicLabel(match.topic as Topic)}
                        </p>
                        <p
                          className={`mt-1 text-xs font-semibold ${
                            match.ratingChange > 0
                              ? "text-emerald-300"
                              : match.ratingChange < 0
                                ? "text-rose-300"
                                : "text-slate-300"
                          }`}
                        >
                          {match.ratingChange > 0 ? "+" : ""}
                          {match.ratingChange} rating
                        </p>
                      </div>
                      <span className="text-slate-200">{match.opponentName}</span>
                      <span className="font-semibold text-white">
                        {match.score.you} - {match.score.opponent}
                      </span>
                      <span
                        className={`font-semibold ${
                          match.result === "win"
                            ? "text-emerald-300"
                            : match.result === "loss"
                              ? "text-rose-300"
                              : "text-slate-300"
                        }`}
                      >
                        {match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Draw"}
                      </span>
                      <span className="text-slate-400">
                        {new Date(match.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center text-slate-300">
                    {selectedMatchTopic === "all"
                      ? "No completed matches yet. Jump into a game and your history will show up here."
                      : `No ${formatTopicLabel(selectedMatchTopic as Topic)} matches yet.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContent>
  );
}
