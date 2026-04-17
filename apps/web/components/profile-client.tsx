"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/button";
import { ProfileCharacterSelector } from "@/components/profile-character-selector";
import { DEFAULT_AVATAR_ID, getAvatar, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { getReadableAuthError, sanitizeDisplayName, validateDisplayName } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { PurchaseSuccessModal } from "@/components/PurchaseSuccessModal";
import { getPremiumItem, type PremiumItem, type PremiumItemType } from "@/lib/premium-items";
import { formatTopicLabel, type Topic } from "@/lib/topics";
import { PageContent } from "@/components/page-content";
import {
  STREAK_EFFECTS,
  EMOTE_PACKS,
  normalizeStreakEffectId,
  normalizeEmotePackId,
  type StreakEffectId,
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
  avatar_id: string | null;
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

  // Owned avatars (premium) are sourced from user_avatars.
  // Free avatars are always considered owned.
  let ownedAvatars: string[] = [];
  try {
    const { data: ownedRows, error: ownedError } = await supabase
      .from("user_avatars")
      .select("avatar_id")
      .eq("user_id", authUserId);
    if (!ownedError && Array.isArray(ownedRows)) {
      const rows = ownedRows as Array<{ avatar_id: string }>;
      ownedAvatars = rows.map((r) => r.avatar_id);
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
    avatarId: normalizeAvatarId(player.avatar_id),
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
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export function ProfileClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [previewAvatarId, setPreviewAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [savingStreakEffect, setSavingStreakEffect] = useState<StreakEffectId | null>(null);
  const [streakEffectError, setStreakEffectError] = useState<string | null>(null);
  const [savingEmotePack, setSavingEmotePack] = useState<EmotePackId | null>(null);
  const [emotePackError, setEmotePackError] = useState<string | null>(null);
  const [buyingPack, setBuyingPack] = useState<EmotePackId | null>(null);
  const [emoteShopError, setEmoteShopError] = useState<string | null>(null);
  const [navPending, setNavPending] = useState(false);

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
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("[profile] auth.getUser failed, redirecting home", userError);
          router.push("/");
          return;
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
        nextData.avatarId = normalizeAvatarId(nextData.avatarId);
        nextData.streakEffect = normalizeStreakEffectId(nextData.streakEffect);
        nextData.emotePack = normalizeEmotePackId(nextData.emotePack);
        console.log("[profile] enriched profile loaded", {
          ratings: nextData.ratings.length,
          matches: nextData.matches.length
        });
        // Source of truth for paid ownership is Supabase `user_emote_packs`.
        // The game server "enriched profile" payload doesn't always include ownership,
        // so preserve it from the initial Supabase load to avoid UI flicker back to Locked.
        setData({
          ...nextData,
          ownedEmotePacks:
            Array.isArray(nextData.ownedEmotePacks) && nextData.ownedEmotePacks.length > 0
              ? nextData.ownedEmotePacks
              : fallbackData.ownedEmotePacks,
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

  // Post-purchase UX: confirm session, refresh ownership instantly, then show premium unlock modal.
  useEffect(() => {
    const purchase = searchParams?.get("purchase");
    const sessionId = searchParams?.get("session_id");
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
  }, [authUserId, router, searchParams]);

  const bestTopicLabel = useMemo(() => {
    if (!data?.summary.highestRatedTopic) {
      return "No matches yet";
    }

    return formatTopicLabel(data.summary.highestRatedTopic as Topic);
  }, [data?.summary.highestRatedTopic]);
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

  const selectedStreakEffect = normalizeStreakEffectId(data?.streakEffect);
  const selectedEmotePack = normalizeEmotePackId(data?.emotePack);
  const ownedEmotePacks = new Set((data?.ownedEmotePacks ?? ["starter"]).map(String));
  const isPackOwned = (packId: EmotePackId) => packId === "starter" || ownedEmotePacks.has(packId);
  const ownedAvatars = new Set((data?.ownedAvatars ?? []).map(String));
  const isAvatarOwned = (avatarId: "architect" | "titan") => ownedAvatars.has(avatarId);

  const handleStreakEffectSelect = async (effectId: StreakEffectId) => {
    if (!authUserId || !data || savingStreakEffect || data.streakEffect === effectId) return;

    const previousEffect = data.streakEffect;
    setStreakEffectError(null);
    setSavingStreakEffect(effectId);
    setData((current) => (current ? { ...current, streakEffect: effectId } : current));

    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase
        .from("players")
        .update({ streak_effect: effectId } as never)
        .eq("auth_user_id", authUserId);

      if (updateError) throw new Error("Unable to update streak effect.");
    } catch (updateError) {
      setData((current) => (current ? { ...current, streakEffect: previousEffect } : current));
      setStreakEffectError(
        updateError instanceof Error ? updateError.message : "Unable to update streak effect."
      );
    } finally {
      setSavingStreakEffect(null);
    }
  };

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
    <PageContent className="space-y-6 sm:space-y-8 md:space-y-10">
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

          <Button
            variant="secondary"
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
            ownedAvatarIds={[...(data?.ownedAvatars ?? []), "flash", "shadow", "guardian", "inferno"]}
            onBuyPremiumAvatar={(avatarId) => void handleBuyAvatar(avatarId)}
            onPreviewChange={setPreviewAvatarId}
            onSelect={(avatarId) => void handleAvatarSelect(avatarId)}
          />
          {avatarError ? <p className="mt-4 text-sm text-rose-300">{avatarError}</p> : null}
        </div>

        {/* ── Cosmetics ─────────────────────────────────────────── */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.3em] text-violet-300">
                Cosmetics
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">Identity</h2>
            <p className="text-sm text-slate-400">
              Personalise how you look and feel in matches. Some cosmetics are locked (simulated unlocks for now).
            </p>
          </div>

          {/* Streak Effect */}
          <div className="mt-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Streak Effect</p>
            <p className="mt-1 text-xs text-slate-500">
              Visual style shown when you're on a streak mid-match.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STREAK_EFFECTS.map((effect) => {
                const isSelected = selectedStreakEffect === effect.id;
                const isSaving = savingStreakEffect === effect.id;
                const icon = effect.id === "none" ? "—" : effect.id === "fire" ? "🔥" : "⚡";
                return (
                  <button
                    key={effect.id}
                    type="button"
                    onClick={() => void handleStreakEffectSelect(effect.id as StreakEffectId)}
                    disabled={loading || Boolean(savingStreakEffect) || isSelected}
                    className={`relative flex flex-col items-start rounded-2xl border px-4 py-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                      isSelected
                        ? "border-sky-400/60 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.10)]"
                        : "border-slate-700 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-900 active:scale-[0.98]"
                    } ${isSaving ? "opacity-60" : ""}`}
                  >
                    <span className={`text-xl ${effect.id === "none" ? "text-slate-500" : ""}`}>
                      {icon}
                    </span>
                    <p className={`mt-2 text-sm font-semibold ${isSelected ? "text-white" : "text-slate-300"}`}>
                      {effect.name}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {effect.description}
                    </p>
                    {isSelected && (
                      <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                        Equipped
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {streakEffectError ? (
              <p className="mt-3 text-sm text-rose-300">{streakEffectError}</p>
            ) : null}
          </div>

          {/* Emote Pack */}
          <div className="mt-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Emote Pack</p>
            <p className="mt-1 text-xs text-slate-500">
              Quick messages you can send to your opponent during a match.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {EMOTE_PACKS.map((pack) => {
                const isSelected = selectedEmotePack === pack.id;
                const isSaving = savingEmotePack === pack.id;
                const unlocked = pack.unlockedByDefault || isPackOwned(pack.id as EmotePackId);
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => void handleEmotePackSelect(pack.id as EmotePackId)}
                    disabled={loading || Boolean(savingEmotePack) || isSelected || !unlocked}
                    className={`relative flex flex-col items-start rounded-2xl border px-4 py-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                      isSelected
                        ? "border-sky-400/60 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.10)]"
                        : unlocked
                          ? "border-slate-700 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-900 active:scale-[0.98]"
                          : "border-slate-800 bg-slate-950/40 opacity-60 saturate-75"
                    } ${isSaving ? "opacity-60" : ""}`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${isSelected ? "text-white" : "text-slate-300"}`}>
                        {pack.name}
                      </p>
                      {isSelected ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                          Equipped
                        </span>
                      ) : !unlocked ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                          Locked
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {pack.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {pack.emoteIds.map((emoteId) => {
                        const emote = EMOTES.find((e) => e.id === emoteId);
                        return emote ? (
                          <span
                            key={emoteId}
                            title={emote.label}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                          >
                            <span>{emote.icon}</span>
                            <span>{emote.label}</span>
                          </span>
                        ) : null;
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
            {emotePackError ? (
              <p className="mt-3 text-sm text-rose-300">{emotePackError}</p>
            ) : null}
          </div>

          {/* Emote Packs (preview + buy + equip live here) */}
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Emote Packs</p>
                <p className="mt-1 text-sm text-slate-300">
                  Fun quick-send messages used during matches. Preview how they look in-game, then buy or equip.
                </p>
              </div>
              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">
                Stripe Checkout
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EMOTE_PACKS.filter((p) => p.id !== "starter").map((pack) => {
                const packId = pack.id as EmotePackId;
                const owned = isPackOwned(packId);
                const busy = buyingPack === packId;
                const selected = selectedEmotePack === packId;
                return (
                  <div
                    key={`pack-preview-${pack.id}`}
                    className={`rounded-2xl border p-4 ${
                      selected ? "border-sky-400/35 bg-sky-500/10" : "border-slate-800 bg-slate-950/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-white">{pack.name}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{pack.description}</p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${
                          owned
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                            : "border-amber-400/25 bg-amber-500/10 text-amber-200"
                        }`}
                      >
                        {owned ? (selected ? "Equipped" : "Owned") : "Locked"}
                      </span>
                    </div>

                    {/* In-match mock preview */}
                    <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/65 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                        In-match preview
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {pack.emoteIds.slice(0, 4).map((emoteId) => {
                          const emote = EMOTES.find((e) => e.id === emoteId);
                          return emote ? (
                            <span
                              key={`preview-${pack.id}-${emoteId}`}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200"
                            >
                              <span>{emote.icon}</span>
                              <span className="font-semibold">{emote.label}</span>
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button
                        variant={owned ? "primary" : "primary"}
                        disabled={loading || busy || owned}
                        loading={busy}
                        loadingText="Starting..."
                        onClick={() => void handleBuyEmotePack(packId)}
                      >
                        {owned ? "Owned" : "Buy"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={loading || Boolean(savingEmotePack) || !owned || selected}
                        onClick={() => void handleEmotePackSelect(packId)}
                      >
                        {selected ? "Equipped" : "Equip now"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {emoteShopError ? <p className="mt-3 text-sm text-rose-300">{emoteShopError}</p> : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Ratings</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Current Ratings</h2>
                <div className="mt-1 flex items-center gap-2">
                  <RankBadge rating={data?.summary.highestRating ?? 1000} size="md" />
                  <p className="text-sm text-slate-400">
                    Peak <span className="font-semibold text-white">{data?.summary.highestRating ?? 1000}</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Best Topic</p>
                <p className="mt-1 text-sm font-semibold text-sky-300">{bestTopicLabel}</p>
              </div>
            </div>

            {/* Rank progress toward next tier */}
            {(() => {
              const peakRating = data?.summary.highestRating ?? 1000;
              const { nextRank, progress, pointsNeeded } = getNextRankInfo(peakRating);
              const currentRank = getRankFromRating(peakRating);
              if (!nextRank) {
                return (
                  <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-pink-500/20 bg-pink-500/[0.08] px-4 py-3">
                    <RankBadge rank={currentRank} size="md" />
                    <p className="text-xs font-semibold text-pink-200">
                      Max rank — you&apos;ve reached the top.
                    </p>
                  </div>
                );
              }
              return (
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <RankBadge rank={currentRank} size="sm" />
                      <span className="text-[10px] text-slate-500">current</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">{pointsNeeded} pts away</span>
                      <RankBadge rank={nextRank} size="sm" />
                    </div>
                  </div>
                  {/* Progress track */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${nextRank.progressClass}`}
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-right text-[10px] tabular-nums text-slate-500">
                    {Math.round(progress * 100)}%
                  </p>
                </div>
              );
            })()}

            <div className="mt-6 space-y-3">
              {(data?.ratings ?? []).map((entry, index) => {
                const isBest = index === 0 && totalMatches > 0;
                const entryRank = getRankFromRating(entry.rating);

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
                    <div className="flex items-center gap-2">
                      <RankBadge rank={entryRank} size="md" />
                      <p className="text-xl font-black text-white">{entry.rating}</p>
                    </div>
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
                    No completed matches yet. Jump into a game and your history will show up here.
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
