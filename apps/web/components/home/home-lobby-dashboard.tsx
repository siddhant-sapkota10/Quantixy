"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import type { CoinShopStatus } from "@/lib/coin-shop";
import { LobbyHeroSection } from "@/components/home/lobby-hero-section";
import { RecommendedObjectiveCard } from "@/components/home/recommended-objective-card";
import { LoadoutPreviewPanel } from "@/components/home/loadout-preview-panel";
import { HomeQuickLinks, type HomeQuickLinkId } from "@/components/home/home-quick-links";
import type { DailyLobbySnapshot } from "@/components/home/lobby-utils";
import { StatusStrip } from "@/components/dashboard/dashboard-ui";

type AccountIdentity = {
  displayName: string;
  avatarId: string | null;
  highestRating?: number;
  coins?: number;
  xp?: number;
} | null;

type HomeLobbyDashboardProps = {
  user: User;
  accountIdentity: AccountIdentity;
  isGuest: boolean;
  suggestedGuestName: string;
  lobbyDaily: DailyLobbySnapshot | null;
  lobbyShop: CoinShopStatus | null;
  lobbyLoading: boolean;
  routeBusy: "play" | "ai" | "shop" | "loadout" | "profile" | "leaderboard" | null;
  logoutBusy: boolean;
  onPlayOnline: () => void;
  onPracticeAi: () => void;
  onOpenDailyRewards: () => void;
  onQuickLink: (id: HomeQuickLinkId) => void;
  onLogout: () => void;
  onNavigateShop: () => void;
  onNavigateLoadout: () => void;
  onOpenLogin: () => void;
  getUserDisplayName: (u: User) => string;
};

function buildStatusSlots(daily: DailyLobbySnapshot | null, loading: boolean, coins?: number) {
  if (loading) {
    return [
      { title: "Battle status", body: "Loading your lobby snapshot…" },
      { title: "Tip of the day", body: "Warm up with Practice before you queue online." },
      { title: "Server status", body: "All systems operational." },
    ];
  }

  let battleTitle = "Battle status";
  let battleBody = "Queue online or warm up vs AI to climb the ranks.";
  if (daily?.canClaim) {
    battleTitle = "Reward ready";
    battleBody = "Claim your daily reward from the hero actions or the modal.";
  } else if (daily && !daily.claimedToday && !daily.hasCompletedMatchToday) {
    battleTitle = "Daily progress";
    battleBody = "Complete 1 match today to unlock your reward claim.";
  } else if (typeof coins === "number" && coins >= 350) {
    battleTitle = "Cosmetics";
    battleBody = "You have coins to spend — check the Shop for new gear.";
  } else if (daily?.claimedToday) {
    battleTitle = "Battle status";
    battleBody = "Daily claimed — keep your streak tomorrow.";
  }

  return [
    { title: battleTitle, body: battleBody },
    {
      title: "Tip of the day",
      body: "Read each question twice before locking in — speed matters, accuracy wins.",
    },
    {
      title: "Server status",
      body: "Matchmaking online. If queues feel slow, try a different topic.",
    },
  ];
}

export function HomeLobbyDashboard({
  user,
  accountIdentity,
  isGuest,
  suggestedGuestName,
  lobbyDaily,
  lobbyShop,
  lobbyLoading,
  routeBusy,
  logoutBusy,
  onPlayOnline,
  onPracticeAi,
  onOpenDailyRewards,
  onQuickLink,
  onLogout,
  onNavigateShop,
  onNavigateLoadout,
  onOpenLogin,
  getUserDisplayName,
}: HomeLobbyDashboardProps) {
  const reduceMotion = useReducedMotion();
  const quickLinkBusy: HomeQuickLinkId | null =
    routeBusy === "shop" || routeBusy === "loadout" || routeBusy === "profile" || routeBusy === "leaderboard"
      ? routeBusy
      : null;

  const resolvedName =
    accountIdentity?.displayName ?? (isGuest ? suggestedGuestName : getUserDisplayName(user) || "Player");

  const statusSlots = buildStatusSlots(lobbyDaily, lobbyLoading, accountIdentity?.coins);

  return (
    <div className="space-y-6 sm:space-y-8">
      <LobbyHeroSection
        displayName={resolvedName}
        avatarId={accountIdentity?.avatarId ?? null}
        rating={accountIdentity?.highestRating}
        titleId={lobbyShop?.equipped.title ?? "rookie_solver"}
        coins={accountIdentity?.coins}
        xp={accountIdentity?.xp}
        streak={lobbyDaily && lobbyDaily.currentStreak > 0 ? lobbyDaily.currentStreak : undefined}
        isGuest={isGuest}
        guestHint={
          isGuest
            ? "Guest session — sign in to save coins, XP, ratings, and cosmetics across devices."
            : undefined
        }
        battle={{
          onPlayOnline,
          onPracticeAi,
          onDailyReward: onOpenDailyRewards,
          playBusy: routeBusy === "play",
          practiceBusy: routeBusy === "ai",
          anyBusy: Boolean(routeBusy),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <RecommendedObjectiveCard
          daily={lobbyDaily}
          coins={accountIdentity?.coins}
          loading={lobbyLoading}
          onPracticeAi={onPracticeAi}
          onViewReward={onOpenDailyRewards}
          onClaimReward={onOpenDailyRewards}
          onOpenShop={onNavigateShop}
          onOpenLoadout={onNavigateLoadout}
          shopBusy={routeBusy === "shop"}
          loadoutBusy={routeBusy === "loadout"}
          practiceBusy={routeBusy === "ai"}
        />

        <LoadoutPreviewPanel
          shopStatus={lobbyShop}
          playerAvatarId={accountIdentity?.avatarId ?? null}
          loading={lobbyLoading}
          onEditLoadout={onNavigateLoadout}
          loadoutBusy={routeBusy === "loadout"}
        />

        <div className="flex min-h-0 flex-col">
          <HomeQuickLinks
            onNavigate={onQuickLink}
            busy={quickLinkBusy}
            profileAvatarId={accountIdentity?.avatarId ?? null}
            isGuest={isGuest}
          />
        </div>
      </div>

      <StatusStrip
        slots={statusSlots.map((s, i) => ({
          ...s,
          icon:
            i === 0 ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            ) : i === 1 ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            ),
        }))}
      />

      {!isGuest ? (
        <motion.button
          type="button"
          onClick={() => void onLogout()}
          disabled={logoutBusy}
          whileHover={reduceMotion ? undefined : { y: -1 }}
          className="w-full rounded-2xl border border-rose-400/22 bg-rose-500/[0.08] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.22em] text-rose-100 transition hover:border-rose-400/35 disabled:opacity-55"
        >
          {logoutBusy ? "Logging out…" : "Log Out"}
        </motion.button>
      ) : (
        <button
          type="button"
          onClick={onOpenLogin}
          className="w-full py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--qx-text-muted)] transition hover:text-[var(--qx-text-primary)]"
        >
          Already have an account? Log In
        </button>
      )}
    </div>
  );
}
