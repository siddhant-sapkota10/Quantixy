-- Migration: emote pack catalog + ownership (Stripe Checkout)

-- Catalog of sellable packs. (Starter is free; tilt/clutch are paid.)
CREATE TABLE IF NOT EXISTS public.emote_packs (
  id text PRIMARY KEY, -- 'starter' | 'tilt' | 'clutch'
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  stripe_price_id text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Durable ownership table (source of truth for paid unlocks).
CREATE TABLE IF NOT EXISTS public.user_emote_packs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES public.emote_packs(id) ON DELETE RESTRICT,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'stripe_checkout',
  stripe_checkout_session_id text NULL,
  UNIQUE (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS user_emote_packs_user_id_idx
  ON public.user_emote_packs(user_id);

-- Seed packs (price ids can be filled later or managed in code/env)
INSERT INTO public.emote_packs (id, slug, name, stripe_price_id, is_active)
VALUES
  ('starter', 'starter-pack', 'Starter Pack', NULL, true),
  ('tilt',    'tilt-pack',    'Tilt Pack',    NULL, true),
  ('clutch',  'clutch-pack',  'Clutch Pack',  NULL, true)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.emote_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_emote_packs ENABLE ROW LEVEL SECURITY;

-- Packs catalog readable by all clients
DO $$ BEGIN
  CREATE POLICY "emote_packs_read_all"
    ON public.emote_packs
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can read their own owned packs
DO $$ BEGIN
  CREATE POLICY "user_emote_packs_read_own"
    ON public.user_emote_packs
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

