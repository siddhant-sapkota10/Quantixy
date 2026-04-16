-- Migration: add cosmetic columns to players table
-- Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS.
-- Run this in the Supabase SQL editor if your local server logs:
--   "column players.streak_effect does not exist"
--   "column players.emote_pack does not exist"

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS streak_effect text NOT NULL DEFAULT 'none';

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS emote_pack text NOT NULL DEFAULT 'basic';

-- Backfill any existing rows that somehow ended up with NULL
-- (safe no-op if the columns already had a NOT NULL default)
UPDATE public.players SET streak_effect = 'none'  WHERE streak_effect IS NULL;
UPDATE public.players SET emote_pack    = 'basic' WHERE emote_pack    IS NULL;
