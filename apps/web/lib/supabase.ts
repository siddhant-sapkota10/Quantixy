"use client";

import { createClient } from "@supabase/supabase-js";

let client:
  | ReturnType<typeof createClient>
  | null = null;

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
    throw new Error(
      `Invalid or missing NEXT_PUBLIC_SUPABASE_URL. Got: "${supabaseUrl}"`
    );
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!client) {
    console.log("[supabase] connecting to:", supabaseUrl);
    client = createClient(supabaseUrl, supabaseAnonKey);
  }

  return client;
}
