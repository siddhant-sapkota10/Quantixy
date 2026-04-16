-- Migration: add player emote pack unlock tracking
-- Supports an emote shop (simulated purchases now, real monetization later).

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS unlocked_emote_packs text[] NOT NULL DEFAULT ARRAY['starter']::text[];

-- Backfill any existing rows that somehow ended up with NULL
UPDATE public.players
SET unlocked_emote_packs = ARRAY['starter']::text[]
WHERE unlocked_emote_packs IS NULL;

