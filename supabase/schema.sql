-- Premium avatar ownership (monetization metadata lives in avatars.json).
-- This table stores which authenticated users own which premium avatars.
-- Note: Payments are intentionally not implemented here; ownership can be granted
-- via backoffice/manual insert or a future Stripe webhook.

create table if not exists public.user_avatars (
  user_id uuid not null,
  avatar_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, avatar_id)
);

