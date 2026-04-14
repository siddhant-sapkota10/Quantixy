create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.players
add column if not exists auth_user_id uuid;

alter table public.players
add column if not exists avatar_id text not null default 'fox';

alter table public.players
add column if not exists display_name text;

update public.players
set display_name = username
where display_name is null;

alter table public.players
alter column display_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_display_name_key'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
    add constraint players_display_name_key unique (display_name);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_auth_user_id_key'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
    add constraint players_auth_user_id_key unique (auth_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_auth_user_id_fkey'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
    add constraint players_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users(id)
    on delete cascade;
  end if;
end;
$$;

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  topic text not null,
  rating integer not null default 1000,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ratings_player_topic_unique unique (player_id, topic)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  player1_id uuid not null references public.players(id) on delete cascade,
  player2_id uuid not null references public.players(id) on delete cascade,
  player1_score integer not null,
  player2_score integer not null,
  player1_rating_change integer not null default 0,
  player2_rating_change integer not null default 0,
  winner_player_id uuid references public.players(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.matches
add column if not exists player1_rating_change integer not null default 0;

alter table public.matches
add column if not exists player2_rating_change integer not null default 0;

alter table public.matches
alter column winner_player_id drop not null;

create index if not exists ratings_topic_rating_idx on public.ratings (topic, rating desc);
create index if not exists matches_topic_created_at_idx on public.matches (topic, created_at desc);
create index if not exists matches_winner_player_id_idx on public.matches (winner_player_id);

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
before update on public.ratings
for each row
execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.ratings enable row level security;
alter table public.matches enable row level security;

drop policy if exists "players read own profile" on public.players;
create policy "players read own profile"
on public.players
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "players insert own profile" on public.players;
create policy "players insert own profile"
on public.players
for insert
to authenticated
with check (auth.uid() = auth_user_id);

drop policy if exists "players update own profile" on public.players;
create policy "players update own profile"
on public.players
for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists "ratings read own profile" on public.ratings;
create policy "ratings read own profile"
on public.ratings
for select
to authenticated
using (
  exists (
    select 1
    from public.players
    where public.players.id = ratings.player_id
      and public.players.auth_user_id = auth.uid()
  )
);

drop policy if exists "matches read own history" on public.matches;
create policy "matches read own history"
on public.matches
for select
to authenticated
using (
  exists (
    select 1
    from public.players
    where public.players.auth_user_id = auth.uid()
      and public.players.id in (matches.player1_id, matches.player2_id)
  )
);
