"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { PageShell } from "@/components/page-shell";
import { getReadableAuthError, updatePassword } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setHasSession(Boolean(data.session));
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setHasSession(Boolean(nextSession));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newPassword.trim()) {
      setError("Enter a new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const { error: updateError } = await updatePassword(newPassword);

      if (updateError) {
        throw updateError;
      }

      setMessage("Password updated successfully. You can now log in.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? getReadableAuthError(updateError.message)
          : "Unable to update your password."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell className="flex items-center justify-center">
      <section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-glow backdrop-blur md:p-10">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Account Recovery</p>
          <h1 className="text-3xl font-black tracking-tight text-white">Reset Password</h1>
          <p className="text-sm text-slate-300">
            Set a new password for your account.
          </p>
        </div>

        {!hasSession ? (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Open this page from the password reset email link so your recovery session is active.
          </div>
        ) : null}

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              New Password
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setError(null);
              }}
              placeholder="Enter a new password"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Confirm Password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError(null);
              }}
              placeholder="Confirm your new password"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
            />
          </label>

          <Button className="w-full" type="submit" disabled={busy} loading={busy} loadingText="Updating...">
            Update Password
          </Button>
        </form>

        {message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-6">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 transition hover:text-sky-300"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
