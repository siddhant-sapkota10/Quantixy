"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { ensurePlayerProfileForUser } from "@/lib/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof window === "undefined") {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const nextParam = params.get("next") ?? "/";
      const next = nextParam.startsWith("/") ? nextParam : "/";

      if (!code) {
        router.replace(next);
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth] exchangeCodeForSession:error", error);
        } else {
          const { data } = await supabase.auth.getUser();
          if (data.user) {
            try {
              await ensurePlayerProfileForUser(data.user);
            } catch (profileError) {
              console.error("[auth] ensurePlayerProfileForUser:error", profileError);
            }
          }
        }
      } finally {
        if (!cancelled) {
          router.replace(next);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

