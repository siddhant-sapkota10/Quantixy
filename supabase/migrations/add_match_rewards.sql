-- Match-based XP/Coins reward system with level progression and deduplication.
-- Apply through Supabase SQL editor or your migration workflow.

-- ── 1. Add level column to player_wallets ─────────────────────────────────

ALTER TABLE public.player_wallets
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1 CHECK (level >= 1);

-- ── 2. Deduplication table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.processed_match_rewards (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_token text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  coins_awarded integer NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
  level_before integer NOT NULL DEFAULT 1,
  level_after integer NOT NULL DEFAULT 1,
  result text NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  is_ai_match boolean NOT NULL DEFAULT false,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_token)
);

CREATE INDEX IF NOT EXISTS processed_match_rewards_user_id_idx
  ON public.processed_match_rewards(user_id, awarded_at DESC);

ALTER TABLE public.processed_match_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "processed_match_rewards_select_own"
    ON public.processed_match_rewards
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Level computation helper ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  lv integer := 1;
  xp_needed integer;
BEGIN
  LOOP
    -- XP needed to reach (lv+1): 100 + (lv - 1) * 50
    xp_needed := 100 + (lv - 1) * 50;
    EXIT WHEN p_xp < xp_needed;
    p_xp := p_xp - xp_needed;
    lv := lv + 1;
    EXIT WHEN lv >= 9999; -- safety cap
  END LOOP;
  RETURN lv;
END;
$$;

-- ── 4. Main award function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.award_match_rewards(
  p_user_id uuid,
  p_match_token text,
  p_xp integer,
  p_coins integer,
  p_result text,
  p_is_ai_match boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  wallet_row public.player_wallets%ROWTYPE;
  level_before integer;
  level_after integer;
  new_xp integer;
  new_coins integer;
BEGIN
  -- Guard: result must be valid
  IF p_result NOT IN ('win', 'loss', 'draw') THEN
    RAISE EXCEPTION 'Invalid result value: %', p_result
      USING ERRCODE = 'P0001';
  END IF;

  -- Ensure wallet exists
  INSERT INTO public.player_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock wallet row
  SELECT * INTO wallet_row
  FROM public.player_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  level_before := wallet_row.level;
  new_xp := wallet_row.xp + p_xp;
  new_coins := wallet_row.coins + p_coins;
  level_after := public.compute_level_from_xp(new_xp);

  -- Update wallet
  UPDATE public.player_wallets
  SET
    xp = new_xp,
    coins = new_coins,
    level = level_after,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO wallet_row;

  -- Record dedup entry (will raise unique violation if already claimed)
  INSERT INTO public.processed_match_rewards (
    user_id, match_token, xp_awarded, coins_awarded,
    level_before, level_after, result, is_ai_match
  )
  VALUES (
    p_user_id, p_match_token, p_xp, p_coins,
    level_before, level_after, p_result, p_is_ai_match
  );

  -- Also mark the daily match as completed (feeds daily reward eligibility)
  INSERT INTO public.daily_reward_states (user_id, current_streak, longest_streak, last_login_date, completed_match_date)
  VALUES (p_user_id, 1, 1, current_date, current_date)
  ON CONFLICT (user_id) DO UPDATE
  SET completed_match_date = current_date, updated_at = now();

  RETURN jsonb_build_object(
    'xpAwarded', p_xp,
    'coinsAwarded', p_coins,
    'levelBefore', level_before,
    'levelAfter', level_after,
    'leveledUp', level_after > level_before,
    'wallet', jsonb_build_object(
      'xp', wallet_row.xp,
      'coins', wallet_row.coins,
      'level', wallet_row.level
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_level_from_xp(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.award_match_rewards(uuid, text, integer, integer, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_level_from_xp(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_match_rewards(uuid, text, integer, integer, text, boolean) TO service_role;
