-- Daily rewards, streaks, and lightweight wallet economy.
-- Apply through Supabase SQL editor or your migration workflow.

CREATE TABLE IF NOT EXISTS public.player_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_reward_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_login_date date,
  last_claimed_date date,
  completed_match_date date,
  cycle_count integer NOT NULL DEFAULT 0 CHECK (cycle_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_reward_claims (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_date date NOT NULL DEFAULT current_date,
  streak_day integer NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
  cycle_count integer NOT NULL DEFAULT 0 CHECK (cycle_count >= 0),
  coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  premium_reward text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_date)
);

CREATE INDEX IF NOT EXISTS daily_reward_claims_user_id_idx
  ON public.daily_reward_claims(user_id, reward_date DESC);

ALTER TABLE public.player_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reward_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reward_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "player_wallets_select_own"
    ON public.player_wallets
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "daily_reward_states_select_own"
    ON public.daily_reward_states
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "daily_reward_claims_select_own"
    ON public.daily_reward_claims
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_daily_reward_track(p_cycle_count integer DEFAULT 0)
RETURNS TABLE (
  day integer,
  coins integer,
  xp integer,
  premium_reward text,
  label text
)
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM (VALUES
    (1, 50 + (p_cycle_count * 10), 10, NULL::text, 'Warm-up coins'),
    (2, 75 + (p_cycle_count * 10), 15, NULL::text, 'Momentum boost'),
    (3, 100 + (p_cycle_count * 15), 20, NULL::text, 'Focus bonus'),
    (4, 125 + (p_cycle_count * 15), 25, NULL::text, 'Combo cache'),
    (5, 175 + (p_cycle_count * 20), 35, NULL::text, 'Power surge'),
    (6, 250 + (p_cycle_count * 25), 50, NULL::text, 'Pre-clutch vault'),
    (7, 500 + (p_cycle_count * 50), 100, 'emote_pack:clutch', 'Premium clutch pack')
  ) AS rewards(day, coins, xp, premium_reward, label);
$$;

CREATE OR REPLACE FUNCTION public.touch_daily_reward_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  today date := current_date;
  state_row public.daily_reward_states%ROWTYPE;
  wallet_row public.player_wallets%ROWTYPE;
  next_streak integer;
  next_cycle integer;
  track jsonb;
  has_match boolean;
  claimed_today boolean;
BEGIN
  INSERT INTO public.player_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.daily_reward_states (user_id, current_streak, longest_streak, last_login_date)
  VALUES (p_user_id, 1, 1, today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO state_row
  FROM public.daily_reward_states
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF state_row.last_login_date IS NULL THEN
    next_streak := 1;
  ELSIF state_row.last_login_date = today THEN
    next_streak := GREATEST(state_row.current_streak, 1);
  ELSIF state_row.last_login_date = today - 1 THEN
    next_streak := state_row.current_streak + 1;
  ELSE
    next_streak := 1;
  END IF;

  next_cycle := FLOOR(GREATEST(next_streak - 1, 0) / 7);

  UPDATE public.daily_reward_states
  SET
    current_streak = next_streak,
    longest_streak = GREATEST(longest_streak, next_streak),
    cycle_count = next_cycle,
    last_login_date = today,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO state_row;

  SELECT * INTO wallet_row
  FROM public.player_wallets
  WHERE user_id = p_user_id;

  has_match := state_row.completed_match_date = today;
  claimed_today := state_row.last_claimed_date = today
    OR EXISTS (
      SELECT 1 FROM public.daily_reward_claims
      WHERE user_id = p_user_id AND reward_date = today
    );

  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.day)
  INTO track
  FROM public.get_daily_reward_track(state_row.cycle_count) AS t;

  RETURN jsonb_build_object(
    'today', today,
    'currentStreak', state_row.current_streak,
    'longestStreak', state_row.longest_streak,
    'cycleCount', state_row.cycle_count,
    'currentDay', ((state_row.current_streak - 1) % 7) + 1,
    'hasCompletedMatchToday', has_match,
    'claimedToday', claimed_today,
    'canClaim', has_match AND NOT claimed_today,
    'coins', COALESCE(wallet_row.coins, 0),
    'xp', COALESCE(wallet_row.xp, 0),
    'track', COALESCE(track, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_daily_match_completed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.daily_reward_states (user_id, current_streak, longest_streak, last_login_date, completed_match_date)
  VALUES (p_user_id, 1, 1, current_date, current_date)
  ON CONFLICT (user_id) DO UPDATE
  SET
    completed_match_date = current_date,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_reward(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  today date := current_date;
  state_row public.daily_reward_states%ROWTYPE;
  reward_row record;
  wallet_row public.player_wallets%ROWTYPE;
BEGIN
  PERFORM public.touch_daily_reward_login(p_user_id);

  SELECT * INTO state_row
  FROM public.daily_reward_states
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF state_row.completed_match_date IS DISTINCT FROM today THEN
    RAISE EXCEPTION 'Complete one match before claiming today''s reward.'
      USING ERRCODE = 'P0001';
  END IF;

  IF state_row.last_claimed_date = today OR EXISTS (
    SELECT 1 FROM public.daily_reward_claims WHERE user_id = p_user_id AND reward_date = today
  ) THEN
    RAISE EXCEPTION 'Daily reward already claimed.'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO reward_row
  FROM public.get_daily_reward_track(state_row.cycle_count)
  WHERE day = ((state_row.current_streak - 1) % 7) + 1;

  INSERT INTO public.daily_reward_claims (
    user_id,
    reward_date,
    streak_day,
    cycle_count,
    coins,
    xp,
    premium_reward
  )
  VALUES (
    p_user_id,
    today,
    reward_row.day,
    state_row.cycle_count,
    reward_row.coins,
    reward_row.xp,
    reward_row.premium_reward
  );

  INSERT INTO public.player_wallets (user_id, coins, xp)
  VALUES (p_user_id, reward_row.coins, reward_row.xp)
  ON CONFLICT (user_id) DO UPDATE
  SET
    coins = public.player_wallets.coins + EXCLUDED.coins,
    xp = public.player_wallets.xp + EXCLUDED.xp,
    updated_at = now()
  RETURNING * INTO wallet_row;

  IF reward_row.premium_reward = 'emote_pack:clutch' THEN
    INSERT INTO public.user_emote_packs (user_id, pack_id, source)
    VALUES (p_user_id, 'clutch', 'daily_reward')
    ON CONFLICT (user_id, pack_id) DO NOTHING;
  END IF;

  UPDATE public.daily_reward_states
  SET last_claimed_date = today, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'reward', jsonb_build_object(
      'day', reward_row.day,
      'coins', reward_row.coins,
      'xp', reward_row.xp,
      'premiumReward', reward_row.premium_reward,
      'label', reward_row.label
    ),
    'wallet', jsonb_build_object(
      'coins', wallet_row.coins,
      'xp', wallet_row.xp
    ),
    'status', public.touch_daily_reward_login(p_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.touch_daily_reward_login(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_daily_match_completed(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_daily_reward(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_daily_reward_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_daily_match_completed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(uuid) TO service_role;
