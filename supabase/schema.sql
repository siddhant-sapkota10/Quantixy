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

-- RLS: authenticated clients read only their rows (see migrations/add_user_avatars_rls.sql).
alter table public.user_avatars enable row level security;

do $$ begin
  create policy "user_avatars_select_own"
    on public.user_avatars
    for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

