"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { getURL } from "@/lib/site-url";

const DISPLAY_NAME_MIN_LENGTH = 3;
const DISPLAY_NAME_MAX_LENGTH = 16;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function sanitizeDisplayName(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export function validateDisplayName(value: string) {
  const displayName = sanitizeDisplayName(value);

  if (!displayName) {
    return "Enter a display name.";
  }

  if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
    return "Display name must be at least 3 characters.";
  }

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return "Display name can only use letters, numbers, spaces, hyphens, and underscores.";
  }

  return null;
}

export const sanitizeUsername = sanitizeDisplayName;
export const validateUsername = validateDisplayName;

export function isAnonymousUser(user: User | null) {
  return Boolean(user?.is_anonymous);
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading
  };
}

export async function signInWithGoogle() {
  const supabase = getSupabaseClient();
  const redirectTo = getURL();

  if (process.env.NODE_ENV !== "production") {
    console.debug("[auth] signInWithGoogle:redirectTo", redirectTo);
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient();
  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
}

export async function signInAsGuest() {
  const supabase = getSupabaseClient();
  return supabase.auth.signInAnonymously();
}

export function getGuestUsername(userId: string) {
  return `Guest-${userId.slice(0, 4).toUpperCase()}`;
}

export async function createPlayerProfileForUser(user: User, displayName: string) {
  const supabase = getSupabaseClient();
  const cleanDisplayName = sanitizeDisplayName(displayName);

  console.log("[auth] createPlayerProfileForUser:start", {
    authUserId: user.id,
    displayName: cleanDisplayName
  });

  const { data: existingPlayer, error: existingPlayerError } = await supabase
    .from("players")
    .select("id, username, display_name, avatar_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingPlayerError) {
    console.error("[auth] createPlayerProfileForUser:existingPlayerError", existingPlayerError);
    throw existingPlayerError;
  }

  if (existingPlayer) {
    console.log("[auth] createPlayerProfileForUser:existingPlayerFound", existingPlayer);
    return existingPlayer;
  }

  const { data: conflictingPlayer, error: conflictingPlayerError } = await supabase
    .from("players")
    .select("id")
    .eq("display_name", cleanDisplayName)
    .maybeSingle();

  if (conflictingPlayerError) {
    console.error("[auth] createPlayerProfileForUser:conflictingPlayerError", conflictingPlayerError);
    throw conflictingPlayerError;
  }

  if (conflictingPlayer) {
    console.warn("[auth] createPlayerProfileForUser:usernameTaken", {
      displayName: cleanDisplayName
    });
    throw new Error("That display name is already taken.");
  }

  const { data: createdPlayer, error: createError } = await supabase
    .from("players")
    .insert(
      {
        auth_user_id: user.id,
        username: cleanDisplayName,
        display_name: cleanDisplayName,
        avatar_id: DEFAULT_AVATAR_ID
      } as never
    )
    .select("id, username, display_name, avatar_id")
    .single();

  if (createError) {
    console.error("[auth] createPlayerProfileForUser:createError", createError);
    throw createError;
  }

  console.log("[auth] createPlayerProfileForUser:created", createdPlayer);
  return createdPlayer;
}

export async function signUpWithPassword(email: string, password: string, displayName: string) {
  const supabase = getSupabaseClient();
  const cleanDisplayName = sanitizeDisplayName(displayName);

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: cleanDisplayName
      }
    }
  });

  console.log("[auth] signUpWithPassword:result", {
    userId: data.user?.id ?? null,
    hasSession: Boolean(data.session),
    email: data.user?.email ?? email.trim(),
    error: error?.message ?? null
  });

  if (error) {
    console.error("[auth] signUpWithPassword:authError", error);
    return { data, error };
  }

  if (data.user && data.session) {
    try {
      await createPlayerProfileForUser(data.user, cleanDisplayName);
    } catch (profileError) {
      console.error("[auth] signUpWithPassword:profileCreationError", profileError);
      return {
        data,
        error: profileError instanceof Error ? profileError : new Error("Unable to create profile.")
      };
    }
  }

  if (data.user && !data.session) {
    console.warn("[auth] signUpWithPassword:signupSucceededWithoutSession", {
      userId: data.user.id
    });
  }

  return { data, error: null };
}

export async function resendSignupVerification(email: string) {
  const supabase = getSupabaseClient();
  const trimmedEmail = email.trim();
  const redirectTo = getURL();

  const result = await supabase.auth.resend({
    type: "signup",
    email: trimmedEmail,
    options: {
      emailRedirectTo: redirectTo
    }
  });

  console.log("[auth] resendSignupVerification:result", {
    email: trimmedEmail,
    error: result.error?.message ?? null
  });

  if (result.error) {
    console.error("[auth] resendSignupVerification:error", result.error);
  }

  return result;
}

function getResetRedirectUrl() {
  return getURL("/reset-password");
}

export async function requestPasswordReset(email: string) {
  const supabase = getSupabaseClient();
  const redirectTo = getResetRedirectUrl();

  if (process.env.NODE_ENV !== "production") {
    console.debug("[auth] requestPasswordReset:redirectTo", redirectTo);
  }

  const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo
  });

  console.log("[auth] requestPasswordReset:result", {
    email: email.trim(),
    redirectTo: redirectTo ?? null,
    error: result.error?.message ?? null
  });

  if (result.error) {
    console.error("[auth] requestPasswordReset:error", result.error);
  }

  return result;
}

export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseClient();
  const result = await supabase.auth.updateUser({ password: newPassword });

  console.log("[auth] updatePassword:result", {
    error: result.error?.message ?? null
  });

  if (result.error) {
    console.error("[auth] updatePassword:error", result.error);
  }

  return result;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  return supabase.auth.signOut();
}

export function getUserDisplayName(user: User | null) {
  if (!user) {
    return "";
  }

  const metadata = user.user_metadata ?? {};
  const candidate =
    metadata.display_name ??
    metadata.user_name ??
    metadata.preferred_username ??
    metadata.full_name ??
    metadata.name ??
    (typeof user.email === "string" ? user.email.split("@")[0] : "");

  return String(candidate || "").trim();
}

export function getProfileUsername(user: User | null) {
  const displayName = getUserDisplayName(user)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);

  if (displayName) {
    return displayName;
  }

  return user ? `player-${user.id.slice(0, 8)}` : "player";
}

export function getReadableAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email before logging in.";
  }

  if (normalized.includes("email rate limit exceeded")) {
    return "Too many email requests. Please wait a moment and try again.";
  }

  if (normalized.includes("for security purposes, you can only request this after")) {
    return "Please wait a moment before requesting another verification email.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "An account with that email already exists.";
  }

  if (normalized.includes("signups not allowed") || normalized.includes("email signups are disabled")) {
    return "Email sign-up is not enabled.";
  }

  if (normalized.includes("anonymous sign-ins are disabled")) {
    return "Guest play is not enabled right now.";
  }

  if (normalized.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }

  if (normalized.includes("password is too weak")) {
    return "Choose a stronger password.";
  }

  if (normalized.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  if (normalized.includes("duplicate key value") || normalized.includes("display_name")) {
    return "That display name is already taken.";
  }

  if (normalized.includes("row-level security") || normalized.includes("new row violates row-level security")) {
    return "We couldn't create your player profile.";
  }

  if (normalized.includes("database error saving new user")) {
    return "We couldn't finish creating your account.";
  }

  return "We couldn't complete that request right now.";
}
