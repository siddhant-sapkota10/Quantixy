"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { DEFAULT_AVATAR_ID, getAvatar, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
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
import { PageContent } from "@/components/page-content";

type AuthMode = "login" | "signup";
type HomeIdentityRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
};

function getAvatarCardSrc(id: AvatarId) {
  return `/assets/avatarCards/${id}.png`;
}

function DisplayNameOnboardingModal({
  open,
  busy,
  error,
  value,
  onChange,
  onSave,
  onLogout,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onLogout: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm sm:px-6">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-glow backdrop-blur sm:p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Welcome</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Choose your display name</h2>
            <p className="mt-1 text-sm text-slate-300">
              This is the name shown in matches, your profile, and the leaderboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-xl px-3 py-2.5 text-sm text-rose-200 underline-offset-4 transition-all duration-150 ease-out hover:text-rose-100 hover:underline active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            Log out
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Display Name
            </span>
            <input
              type="text"
              value={value}
              maxLength={16}
              onChange={(event) => onChange(sanitizeDisplayName(event.target.value))}
              placeholder="Pick a display name"
              className="w-full neon-input rounded-2xl px-4 py-3"
              autoFocus
            />
          </label>

          <Button
            className="w-full"
            onClick={onSave}
            disabled={busy || !value.trim()}
            loading={busy}
            loadingText="Saving..."
          >
            Continue
          </Button>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

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
    }
  }, [onClose, open, user]);

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
      const { error } = await signInWithGoogle("/?onboarding=display_name");

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
        onClose();
        router.push("/?onboarding=display_name");
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
      onClose();
      router.push("/?onboarding=display_name");
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
      <PageContent
        size="md"
        variant="plain"
        className="max-w-lg max-h-[90dvh] overflow-y-auto rounded-[2rem] bg-slate-950/70 p-5 shadow-glow backdrop-blur sm:p-6 md:p-8"
      >
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
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 533.5 544.3" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95h146.9c-6.3 34-25.2 62.8-53.8 82v68h86.9c50.8-46.8 81.5-115.8 81.5-194.8z"
                  />
                  <path
                    fill="currentColor"
                    d="M272 544.3c72.6 0 133.5-24 178-65.3l-86.9-68c-24.1 16.2-55 25.8-91.1 25.8-70 0-129.3-47.2-150.5-110.6h-90.3v69.3c44.2 87.8 135.4 149.8 240.8 149.8z"
                  />
                  <path
                    fill="currentColor"
                    d="M121.5 326.2c-10.6-31.8-10.6-66.2 0-98l.1-69.3H31.2c-39.5 78.8-39.5 172.9 0 251.7l90.3-69.4z"
                  />
                  <path
                    fill="currentColor"
                    d="M272 107.7c39.5-.6 77.6 14 107 40.9l79.7-79.7C409.3 24.3 342.7-1 272 0 166.6 0 75.4 62 31.2 149.8l90.4 69.3C142.7 155 202 107.7 272 107.7z"
                  />
                </svg>
                <span>Continue with Google</span>
              </span>
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
                  className="w-full neon-input rounded-2xl px-4 py-3"
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
              className="w-full neon-input rounded-2xl px-4 py-3"
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
                  className="w-full neon-input rounded-2xl px-4 py-3"
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
      </PageContent>
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
  const [identityNonce, setIdentityNonce] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingName, setOnboardingName] = useState("");
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
          setOnboardingOpen(false);
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

          const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
          const forced = params?.get("onboarding") === "display_name";
          const missingName = !row.display_name || !String(row.display_name).trim();
          if (!isAnonymousUser(user) && (forced || missingName)) {
            setOnboardingName(sanitizeDisplayName(row.display_name ?? row.username ?? ""));
            setOnboardingOpen(true);
          } else {
            setOnboardingOpen(false);
          }
        }

        if (mounted && !row && !isAnonymousUser(user)) {
          // Auth user exists but players row not created yet — force onboarding to create it.
          setAccountIdentity(null);
          setOnboardingName(sanitizeDisplayName(getUserDisplayName(user) || ""));
          setOnboardingOpen(true);
        }
      } catch (error) {
        console.error("[home] identity fetch error", error);
      }
    };

    void loadIdentity();

    return () => {
      mounted = false;
    };
  }, [user, identityNonce]);

  const handleOnboardingSave = async () => {
    if (!user || isAnonymousUser(user)) return;
    const clean = sanitizeDisplayName(onboardingName);
    const validationError = validateDisplayName(clean);
    if (validationError) {
      setOnboardingError(validationError);
      return;
    }

    try {
      setOnboardingBusy(true);
      setOnboardingError(null);
      const supabase = getSupabaseClient();

      const { data: existing } = await supabase
        .from("players")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!existing) {
        await createPlayerProfileForUser(user, clean);
      } else {
        const { error } = await supabase
          .from("players")
          .update({ display_name: clean, username: clean } as never)
          .eq("auth_user_id", user.id);
        if (error) throw error;
      }

      // Remove onboarding param so it doesn't re-open.
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("onboarding");
        window.history.replaceState({}, "", url.toString());
      }

      setOnboardingOpen(false);
      // Re-fetch identity + rating so the home UI updates immediately.
      setIdentityNonce((value) => value + 1);
    } catch (error) {
      setOnboardingError(error instanceof Error ? getReadableAuthError(error.message) : "Unable to save name.");
    } finally {
      setOnboardingBusy(false);
    }
  };

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
      <DisplayNameOnboardingModal
        open={onboardingOpen}
        busy={onboardingBusy}
        error={onboardingError}
        value={onboardingName}
        onChange={(next) => {
          setOnboardingName(next);
          setOnboardingError(null);
        }}
        onSave={handleOnboardingSave}
        onLogout={() => void handleLogout()}
      />
      <PageContent size="md" className="max-w-2xl">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full p-2 sm:p-3"
        >
        <div className="space-y-3 text-center sm:space-y-4">
          <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
            Multiplayer Math Arena
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
           Quantixy
          </h1>
          <p className="text-base text-slate-300 sm:text-lg md:text-xl">Real-time multiplayer math</p>
        </div>

        <div className="mt-8 space-y-5 sm:mt-10">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
            </div>
          ) : !user ? (
            // No session — identity first
            <div className="space-y-2.5">
              {/* Hero guest CTA */}
              <motion.button
                onClick={handleGuestContinue}
                disabled={guestBusy}
                whileHover={guestBusy ? undefined : { scale: 1.01, y: -1 }}
                whileTap={guestBusy ? undefined : { scale: 0.99 }}
                transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                className="group w-full rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent p-5 text-left transition-colors hover:border-sky-400/50 hover:from-sky-500/20 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-black text-white">Continue as Guest</p>
                    <p className="text-sm text-slate-400">Jump in instantly — no account needed</p>
                  </div>
                  {guestBusy ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
                  ) : (
                    <svg className="h-5 w-5 shrink-0 text-sky-400 opacity-50 transition-opacity group-hover:opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </div>
              </motion.button>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <motion.button
                  onClick={() => openAuthModal("signup")}
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                  className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Create Account</p>
                    <p className="text-xs text-slate-500">Save progress across devices</p>
                  </div>
                </motion.button>

                <motion.button
                  onClick={() => openAuthModal("login")}
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                  className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Log In</p>
                    <p className="text-xs text-slate-500">Resume your account</p>
                  </div>
                </motion.button>
              </div>

              {guestError ? <p className="text-sm text-rose-300">{guestError}</p> : null}
            </div>
          ) : (
            // Has session — premium lobby
            <div className="space-y-5">
              {/* ── PLAY ─────────────────────────────────────── */}
              <div className="space-y-2.5">
                <p className="text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Play</p>

                {/* Play Online — hero CTA */}
                <motion.button
                  onClick={handlePlayNow}
                  disabled={Boolean(routeBusy)}
                  whileHover={Boolean(routeBusy) ? undefined : { scale: 1.01, y: -1 }}
                  whileTap={Boolean(routeBusy) ? undefined : { scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                  className="group w-full rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent p-5 text-left transition-colors hover:border-sky-400/50 hover:from-sky-500/20 disabled:cursor-not-allowed disabled:opacity-55 sm:p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-black text-white sm:text-xl">Play Online</p>
                      <p className="text-sm text-slate-400">Compete against real players in live duels</p>
                    </div>
                    {routeBusy === "play" ? (
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
                    ) : (
                      <svg className="h-5 w-5 shrink-0 text-sky-400 opacity-50 transition-opacity group-hover:opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </div>
                </motion.button>

                {/* Practice vs AI */}
                <motion.button
                  onClick={handlePlayVsAi}
                  disabled={Boolean(routeBusy)}
                  whileHover={Boolean(routeBusy) ? undefined : { scale: 1.01, y: -1 }}
                  whileTap={Boolean(routeBusy) ? undefined : { scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                  className="group w-full rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80 disabled:cursor-not-allowed disabled:opacity-55 sm:p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="10" rx="2" />
                        <path d="M9 11V7a3 3 0 016 0v4M12 15v2M8 15v.01M16 15v.01" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-white">Practice vs AI</p>
                      <p className="text-sm text-slate-500">Sharpen your skills offline</p>
                    </div>
                    {routeBusy === "ai" ? (
                      <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-500/30 border-t-slate-400" />
                    ) : (
                      <svg className="h-4 w-4 shrink-0 text-slate-500 opacity-60 transition-opacity group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </div>
                </motion.button>
              </div>

              {/* ── IDENTITY PANEL ───────────────────────────── */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-400/20 bg-slate-950/80">
                  <Image
                    src={getAvatarCardSrc(normalizeAvatarId(accountIdentity?.avatarId ?? DEFAULT_AVATAR_ID))}
                    alt="Equipped avatar"
                    fill
                    sizes="44px"
                    className="object-cover"
                    priority={false}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {accountIdentity?.displayName ?? (isGuest ? suggestedGuestName : "Player")}
                    </p>
                    {!isGuest && accountIdentity?.highestRating !== undefined ? (
                      <RankBadge rating={accountIdentity.highestRating} size="sm" />
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">
                    {isGuest
                      ? "Guest · progress not saved"
                      : accountIdentity?.highestRating !== undefined
                        ? `Rating ${accountIdentity.highestRating}`
                        : "Loading profile…"}
                  </p>
                </div>
              </div>

              {/* ── ACCOUNT ──────────────────────────────────── */}
              <div className="space-y-2.5">
                <p className="text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Account</p>

                {isGuest ? (
                  <>
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                      Playing as a guest — progress won&apos;t be saved across sessions.
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <motion.button
                        onClick={() => openAuthModal("signup")}
                        whileHover={{ scale: 1.01, y: -1 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                        className="group flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition-colors group-hover:border-sky-500/40 group-hover:bg-sky-500/10 group-hover:text-sky-300">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Upgrade Account</p>
                          <p className="text-xs text-slate-500">Save stats &amp; earn ranks</p>
                        </div>
                      </motion.button>

                      <motion.button
                        onClick={() => { setRouteBusy("leaderboard"); router.push("/leaderboard"); }}
                        disabled={Boolean(routeBusy)}
                        whileHover={Boolean(routeBusy) ? undefined : { scale: 1.01, y: -1 }}
                        whileTap={Boolean(routeBusy) ? undefined : { scale: 0.99 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                        className="group flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80 disabled:opacity-55"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition-colors group-hover:border-yellow-500/40 group-hover:bg-yellow-500/10 group-hover:text-yellow-300">
                          {routeBusy === "leaderboard" ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500/30 border-t-slate-400" />
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M6 9v8a6 6 0 0012 0V9M6 9H18" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Leaderboard</p>
                          <p className="text-xs text-slate-500">See the top players</p>
                        </div>
                      </motion.button>
                    </div>

                    <button
                      onClick={() => openAuthModal("login")}
                      className="w-full py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-300"
                    >
                      Already have an account? Log In
                    </button>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <motion.button
                        onClick={() => { setRouteBusy("profile"); router.push("/profile"); }}
                        disabled={Boolean(routeBusy)}
                        whileHover={Boolean(routeBusy) ? undefined : { scale: 1.01, y: -1 }}
                        whileTap={Boolean(routeBusy) ? undefined : { scale: 0.99 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                        className="group flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80 disabled:opacity-55"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition-colors group-hover:border-sky-500/40 group-hover:bg-sky-500/10 group-hover:text-sky-300">
                          {routeBusy === "profile" ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500/30 border-t-slate-400" />
                          ) : (
                            <span className="relative h-7 w-7 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                              <Image
                                src={getAvatarCardSrc(normalizeAvatarId(accountIdentity?.avatarId ?? DEFAULT_AVATAR_ID))}
                                alt="Equipped avatar"
                                fill
                                sizes="28px"
                                className="object-cover"
                                priority={false}
                              />
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Profile</p>
                          <p className="text-xs text-slate-500">Stats &amp; match history</p>
                        </div>
                      </motion.button>

                      <motion.button
                        onClick={() => { setRouteBusy("leaderboard"); router.push("/leaderboard"); }}
                        disabled={Boolean(routeBusy)}
                        whileHover={Boolean(routeBusy) ? undefined : { scale: 1.01, y: -1 }}
                        whileTap={Boolean(routeBusy) ? undefined : { scale: 0.99 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                        className="group flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/80 disabled:opacity-55"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition-colors group-hover:border-yellow-500/40 group-hover:bg-yellow-500/10 group-hover:text-yellow-300">
                          {routeBusy === "leaderboard" ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500/30 border-t-slate-400" />
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M6 9v8a6 6 0 0012 0V9M6 9H18" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Leaderboard</p>
                          <p className="text-xs text-slate-500">See the top players</p>
                        </div>
                      </motion.button>
                    </div>

                    <button
                      onClick={() => void handleLogout()}
                      disabled={logoutBusy}
                      className="group relative w-full overflow-hidden rounded-2xl border border-rose-400/25 bg-gradient-to-r from-rose-500/20 via-rose-500/10 to-transparent px-4 py-3 text-left text-xs font-black uppercase tracking-[0.24em] text-rose-100 shadow-[0_18px_50px_rgba(244,63,94,0.18)] transition-colors hover:border-rose-400/40 hover:from-rose-500/26 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <span className="relative flex items-center justify-between gap-3">
                        <span>{logoutBusy ? "Logging out…" : "Log Out"}</span>
                        <span className="rounded-full border border-rose-200/15 bg-rose-950/30 px-2.5 py-1 text-[10px] font-bold tracking-[0.22em] text-rose-100/90">
                          Exit
                        </span>
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </motion.section>
      </PageContent>

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

