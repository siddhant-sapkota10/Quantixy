const { createClient } = require("@supabase/supabase-js");

// Prefer the server-side name SUPABASE_URL; fall back to the legacy NEXT_PUBLIC_ name
// so an existing .env without a rename still boots.
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL (or legacy NEXT_PUBLIC_SUPABASE_URL).");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function verifyAccessToken(accessToken) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error) {
    throw error;
  }

  return data.user;
}

module.exports = {
  supabaseAdmin,
  verifyAccessToken
};
