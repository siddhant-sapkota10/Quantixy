import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client (service role).
 * Used by Stripe webhooks to unlock purchases securely.
 */
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
    throw new Error(`Invalid or missing SUPABASE_URL. Got: "${supabaseUrl}"`);
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

