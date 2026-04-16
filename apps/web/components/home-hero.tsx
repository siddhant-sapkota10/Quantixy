"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { getAvatar } from "@/lib/avatars";
import {
  createPlayerProfileForUser,
  getGuestUsername,
  getReadableAuthError,
  getUserDisplayName,
  isAnonymousUser,
  requestPasswordReset,
  resendSignupVerification,
  sanitizeDisplayName,
  signInAsGuest,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  useSupabaseAuth,
  validateDisplayName
} from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { getRankFromRating } from "@/lib/ranks";
import { RankBadge } from "@/components/rank-badge";

type AuthMode = "login" | "signup";
type HomeIdentityRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
};

function AuthModal({
  open,
  mode,
  isGuestSession,
  initialDisplayName,
  onClose
}: {
  open: boolean;
  mode: AuthMode;
  isGuestSession: boolean;
  initialDisplayName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [authMode, setAuthMode] = useState<AuthMode>(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [debugErrorDetail, setDebugErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setAuthMode(mode);
    setDisplayName(initialDisplayName);
    setAuthError(null);
    setAuthMessage(null);
    setForgotOpen(false);
    setPendingVerificationEmail(null);
    setDebugErrorDetail(null);
  }, [initialDisplayName, mode, open]);

  useEffect(() => {
    if (user && !isAnonymousUser(user) && open) {
      onClose();
      router.push("/play");
    }
  }, [onClose, open, router, user]);

  if (!open) {
    return null;
  }

  const prepareForAccountAuth = async () => {
    if (!isGuestSession) {
      return;
    }

    await signOut();
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthBusy(true);
      setAuthError(null);
      setAuthMessage(null);
      setDebugErrorDetail(null);
      await prepareForAccountAuth();
      const { error } = await signInWithGoogle();

      if (error) {
        throw error;
      }
    } catch (error) {
      setDebugErrorDetail(error instanceof Error ? error.message : null);
      setAuthError(
        error instanceof Error ? getReadableAuthError(error.message) : "Unable to sign in with Google."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const cleanDisplayName = sanitizeDisplayName(displayName);

    if (!trimmedEmail) {
      setAuthError("Enter your email address.");
      return;
    }

    if (!trimmedPassword) {
      setAuthError("Enter your password.");
      return;
    }

    if (authMode === "signup") {
      const displayNameError = validateDisplayName(cleanDisplayName);

      if (displayNameError) {
        setAuthError(displayNameError);
        return;
      }
    }

    try {
      setAuthBusy(true);
      setAuthError(null);
      setAuthMessage(null);
      setDebugErrorDetail(null);
      await prepareForAccountAuth();

      if (authMode === "signup") {
        const { data, error } = await signUpWithPassword(trimmedEmail, trimmedPassword, cleanDisplayName);

        console.log("[home] create-account result", {
          userId: data.user?.id ?? null,
          hasSession: Boolean(data.session),
          error: error?.message ?? null
        });

        if (error) {
          console.error("[home] create-account failed", {
            step: data.user ? "profile creation" : "auth sign-up",
            error
          });
          setDebugErrorDetail(error.message);
          throw error;
        }

        if (data.user && !data.session) {
          setPendingVerificationEmail(trimmedEmail);
          setAuthMessage(
            "Account created. If email confirmation is enabled for this project, check your inbox and spam folder."
          );
          setPassword("");
          return;
        }

        setPendingVerificationEmail(null);
        setAuthMessage("Account created. You're signed in and ready to play.");
        return;
      }

      const { data, error } = await signInWithPassword(trimmedEmail, trimmedPassword);

      console.log("[home] login result", {
        userId: data.user?.id ?? null,
        error: error?.message ?? null
      });

      if (error) {
        setDebugErrorDetail(error.message);
        throw error;
      }

      if (data.user) {
        try {
          const suggestedDisplayName =
            sanitizeDisplayName(getUserDisplayName(data.user)) || getGuestUsername(data.user.id);
          await createPlayerProfileForUser(data.user, suggestedDisplayName);
        } catch (profileError) {
          console.error("[home] login profile setup failed", profileError);
          throw new Error("We couldn't create your player profile.");
        }
      }

      setAuthMessage("Logged in successfully.");
    } catch (error) {
      setDebugErrorDetail(error instanceof Error ? error.message : null);
      setAuthError(
        error instanceof Error ? getReadableAuthError(error.message) : "Unable to continue."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = pendingVerificationEmail ?? email.trim();

    if (!targetEmail) {
      setAuthError("Enter your email address first.");
      return;
    }

    try {
      setAuthBusy(true);
      setAuthError(null);
      setAuthMessage(null);
      setDebugErrorDetail(null);

      const { error } = await resendSignupVerification(targetEmail);

      if (error) {
        setDebugErrorDetail(error.message);
        throw error;
      }

      setAuthMessage("Verification email sent. Check your inbox and spam folder.");
    } catch (error) {
      setDebugErrorDetail(error instanceof Error ? error.message : null);
      setAuthError(
        error instanceof Error ? getReadableAuthError(error.message) : "Unable to resend verification email."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPasswordRequest = async () => {
    const targetEmail = email.trim();

    if (!targetEmail) {
      setAuthError("Enter your email address.");
      return;
    }

    try {
      setAuthBusy(true);
      setAuthError(null);
      setAuthMessage(null);
      setDebugErrorDetail(null);

      const { error } = await requestPasswordReset(targetEmail);

      if (error) {
        setDebugErrorDetail(error.message);
        throw error;
      }

      setAuthMessage("Check your email for a password reset link.");
    } catch (error) {
      setDebugErrorDetail(error instanceof Error ? error.message : null);
      setAuthError(
        error instanceof Error ? getReadableAuthError(error.message) : "Unable to send reset email."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm sm:px-6">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-950/95 p-5 shadow-glow max-h-[90dvh] overflow-y-auto sm:p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Authentication</p>
            <h2 className="mt-2 text-2xl font-bold text-white">
              {forgotOpen
                ? "Reset your password"
                : authMode === "login"
                  ? "Log in to play"
                  : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              {forgotOpen
                ? "Enter your account email and we will send a reset link."
                : authMode === "login"
                  ? "Sign in to keep your rating, profile, and match history."
                  : "Create an account to save your identity across devices."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl px-3 py-2.5 text-sm text-slate-300 underline-offset-4 transition-all duration-150 ease-out hover:text-sky-300 hover:underline active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
          >
            Close
          </button>
        </div>

        {isGuestSession ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Guest mode is temporary. Creating or logging into an account will start a permanent profile.
            Guest progress is not linked automatically yet.
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {!forgotOpen ? (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
                setAuthMessage(null);
                setForgotOpen(false);
                setPendingVerificationEmail(null);
              }}
              disabled={authBusy || loading}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                authMode === "login"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-900/70"
              } ${authBusy || loading ? "cursor-not-allowed opacity-55 saturate-50" : "active:scale-[0.975]"}`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setAuthError(null);
                setAuthMessage(null);
                setForgotOpen(false);
                setPendingVerificationEmail(null);
              }}
              disabled={authBusy || loading}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                authMode === "signup"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-900/70"
              } ${authBusy || loading ? "cursor-not-allowed opacity-55 saturate-50" : "active:scale-[0.975]"}`}
            >
              Create Account
            </button>
            </div>
          ) : null}

          {!forgotOpen ? (
            <Button
              variant="secondary"
              className="w-full font-bold"
              onClick={handleGoogleSignIn}
              disabled={authBusy || loading}
              loading={authBusy}
              loadingText="Connecting..."
            >
              Continue with Google
            </Button>
          ) : null}

          <div className="space-y-2">
            {authMode === "signup" && !forgotOpen ? (
              <>
                <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                  Display Name
                </span>
                <input
                  type="text"
                  value={displayName}
                  maxLength={16}
                  onChange={(event) => {
                    setDisplayName(sanitizeDisplayName(event.target.value));
                    setAuthError(null);
                  }}
                  placeholder="Choose a display name"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
                />
              </>
            ) : null}

            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setAuthError(null);
              }}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
            />
            {!forgotOpen ? (
              <>
                <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setAuthError(null);
                  }}
                  placeholder={authMode === "signup" ? "Create a password" : "Enter your password"}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
                />
              </>
            ) : null}
            {forgotOpen ? (
              <>
                <Button
                  className="w-full"
                  onClick={handleForgotPasswordRequest}
                  disabled={authBusy || loading}
                  loading={authBusy}
                  loadingText="Sending..."
                >
                  Send Reset Link
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setForgotOpen(false);
                    setAuthMode("login");
                    setAuthError(null);
                    setAuthMessage(null);
                  }}
                  disabled={authBusy || loading}
                >
                  Back to Log In
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full"
                  onClick={handlePasswordAuth}
                  disabled={authBusy || loading}
                  loading={authBusy}
                  loadingText={authMode === "login" ? "Logging In..." : "Creating..."}
                >
                  {authMode === "login" ? "Log In" : "Create Account"}
                </Button>
                {authMode === "login" ? (
                  <Button
                    variant="ghost"
                    className="w-auto self-start px-0 py-0 text-xs font-medium uppercase tracking-[0.2em]"
                    onClick={() => {
                      setForgotOpen(true);
                      setAuthError(null);
                      setAuthMessage(null);
                      setPendingVerificationEmail(null);
                    }}
                  >
                    Forgot password?
                  </Button>
                ) : null}
              </>
            )}

            {pendingVerificationEmail ? (
              <Button
                variant="ghost"
                className="w-auto self-start px-0 py-0 text-xs font-medium uppercase tracking-[0.2em]"
                onClick={handleResendVerification}
                disabled={authBusy || loading}
                loading={authBusy}
                loadingText="Sending..."
              >
                Resend Verification Email
              </Button>
            ) : null}
          </div>

          {authMessage ? <p className="text-sm text-emerald-300">{authMessage}</p> : null}
          {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}
          {process.env.NODE_ENV !== "production" && debugErrorDetail ? (
            <p className="text-xs text-slate-400">Debug: {debugErrorDetail}</p>
          ) : null}
          {pendingVerificationEmail ? (
            <p className="text-sm text-slate-300">
              If email confirmation is enabled for this project, verify your account and then log in with{" "}
              <span className="font-semibold text-white">{pendingVerificationEmail}</span>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HomeHero() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [guestBusy, setGuestBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState<"play" | "ai" | "profile" | "leaderboard" | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [accountIdentity, setAccountIdentity] = useState<{
    displayName: string;
    avatarId: string | null;
    highestRating?: number;
  } | null>(null);
  const isGuest = isAnonymousUser(user);
  const suggestedGuestName = user ? getGuestUsername(user.id) : "";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryType = hashParams.get("type") ?? searchParams.get("type");

    if (recoveryType !== "recovery") {
      return;
    }

    if (window.location.pathname === "/reset-password") {
      return;
    }

    const target = `/reset-password${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadIdentity = async () => {
      if (!user) {
        if (mounted) {
          setAccountIdentity(null);
        }
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("players")
          .select("id, display_name, username, avatar_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("[home] failed to load player identity", error);
          return;
        }

        const row = data as HomeIdentityRow | null;

        if (mounted && row) {
          let highestRating: number | undefined;
          try {
            const { data: ratingRow } = await supabase
              .from("ratings")
              .select("rating")
              .eq("player_id", row.id)
              .order("rating", { ascending: false })
              .limit(1)
              .maybeSingle();
            highestRating = (ratingRow as { rating: number } | null)?.rating;
          } catch {
            // Non-critical — rank just won't show on home screen
          }

          setAccountIdentity({
            displayName: row.display_name ?? row.username ?? "Player",
            avatarId: row.avatar_id ?? null,
            highestRating,
          });
        }
      } catch (error) {
        console.error("[home] identity fetch error", error);
      }
    };

    void loadIdentity();

    return () => {
      mounted = false;
    };
  }, [user]);

  const openAuthModal = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handlePlayNow = () => {
    if (!user) {
      openAuthModal("login");
      return;
    }

    setRouteBusy("play");
    router.push("/play");
  };

  const handlePlayVsAi = () => {
    if (!user) {
      openAuthModal("login");
      return;
    }

    setRouteBusy("ai");
    router.push("/play?mode=ai");
  };

  const handleGuestContinue = async () => {
    if (user) {
      router.push("/play");
      return;
    }

    try {
      setGuestBusy(true);
      setGuestError(null);

      const { data, error } = await signInAsGuest();

      if (error) {
        console.error("[home] guest sign-in failed", error);
        throw error;
      }

      if (data.user) {
        await createPlayerProfileForUser(data.user, getGuestUsername(data.user.id));
      }

      router.push("/play");
    } catch (error) {
      setGuestError(
        error instanceof Error ? getReadableAuthError(error.message) : "Unable to continue as guest."
      );
    } finally {
      setGuestBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLogoutBusy(true);
      await signOut();
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur sm:p-8 md:p-12"
      >
        <div className="space-y-3 text-center sm:space-y-4">
          <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
            Multiplayer Math Arena
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
           Arithix
          </h1>
          <p className="text-base text-slate-300 sm:text-lg md:text-xl">Real-time multiplayer math</p>
        </div>

        <div className="mt-8 space-y-4 text-center sm:mt-12">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              className="w-full py-4 text-lg font-black shadow-lg shadow-sky-500/20 sm:py-5 sm:text-xl"
              onClick={handlePlayNow}
              disabled={loading || guestBusy || Boolean(routeBusy)}
              loading={routeBusy === "play"}
              loadingText="Opening..."
            >
              Play Online
            </Button>
            <Button
              variant="secondary"
              className="w-full py-4 text-lg font-bold sm:py-5 sm:text-xl"
              onClick={handlePlayVsAi}
              disabled={loading || guestBusy || Boolean(routeBusy)}
              loading={routeBusy === "ai"}
              loadingText="Opening..."
            >
              Play vs AI 🤖
            </Button>
          </div>

          {user ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-400/20 bg-slate-950/80 text-2xl">
                {getAvatar(accountIdentity?.avatarId).icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {isGuest ? "Guest Account" : "Account Ready"}
                </p>
                <p className="text-base font-semibold text-white">
                  {accountIdentity?.displayName ?? (isGuest ? suggestedGuestName : "Player")}
                </p>
                {!isGuest && accountIdentity?.highestRating !== undefined ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <RankBadge rating={accountIdentity.highestRating} size="sm" />
                    <span className="text-[10px] text-slate-500">{accountIdentity.highestRating}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {!user ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleGuestContinue}
                disabled={guestBusy || loading}
                loading={guestBusy}
                loadingText="Continuing..."
              >
                Continue as Guest
              </Button>
              <Button
                className="w-full"
                onClick={() => openAuthModal("login")}
                disabled={loading}
              >
                Log In
              </Button>
              <Button
                className="w-full"
                onClick={() => openAuthModal("signup")}
                disabled={loading}
              >
                Create Account
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:col-span-2"
                onClick={() => {
                  setRouteBusy("leaderboard");
                  router.push("/leaderboard");
                }}
                loading={routeBusy === "leaderboard"}
                loadingText="Opening..."
              >
                Leaderboard
              </Button>
            </div>
          ) : isGuest ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                You&apos;re playing as a temporary guest. Upgrade to an account to keep your identity across devices.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  className="w-full"
                  onClick={() => openAuthModal("signup")}
                  disabled={loading}
                >
                  Upgrade to Account
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => openAuthModal("login")}
                  disabled={loading}
                >
                  Log In
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => openAuthModal("signup")}
                  disabled={loading}
                >
                  Create Account
                </Button>
                <Button
                  variant="secondary"
                  className="w-full sm:col-span-2"
                  onClick={() => {
                    setRouteBusy("leaderboard");
                    router.push("/leaderboard");
                  }}
                  loading={routeBusy === "leaderboard"}
                  loadingText="Opening..."
                >
                  Leaderboard
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setRouteBusy("profile");
                  router.push("/profile");
                }}
                loading={routeBusy === "profile"}
                loadingText="Opening..."
              >
                Profile
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setRouteBusy("leaderboard");
                  router.push("/leaderboard");
                }}
                loading={routeBusy === "leaderboard"}
                loadingText="Opening..."
              >
                Leaderboard
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => void handleLogout()}
                disabled={logoutBusy}
                loading={logoutBusy}
                loadingText="Logging Out..."
              >
                Log Out
              </Button>
            </div>
          )}

          {guestError ? <p className="text-sm text-rose-300">{guestError}</p> : null}
        </div>
      </motion.section>

      <AuthModal
        open={authModalOpen}
        mode={authMode}
        isGuestSession={isGuest}
        initialDisplayName={isGuest ? suggestedGuestName : ""}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}
