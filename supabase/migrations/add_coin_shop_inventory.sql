-- Coin shop inventory and equipped lightweight cosmetics.
-- Reuses existing emote pack IDs (`starter`, `tilt`, `clutch`) and ownership table.

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS hit_effect text NOT NULL DEFAULT 'none';

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS avatar_skin text NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.coin_shop_items (
  id text PRIMARY KEY,
  item_type text NOT NULL CHECK (item_type IN ('emote_pack', 'hit_effect', 'avatar_skin')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('free', 'common', 'rare', 'epic', 'premium')),
  price_coins integer NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_cosmetic_items (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('hit_effect', 'avatar_skin')),
  item_id text NOT NULL,
  source text NOT NULL DEFAULT 'coin_shop',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS public.coin_shop_purchases (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.coin_shop_items(id) ON DELETE RESTRICT,
  price_coins integer NOT NULL CHECK (price_coins >= 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS user_cosmetic_items_user_id_idx
  ON public.user_cosmetic_items(user_id);

CREATE INDEX IF NOT EXISTS coin_shop_purchases_user_id_idx
  ON public.coin_shop_purchases(user_id, purchased_at DESC);

INSERT INTO public.coin_shop_items (id, item_type, name, description, rarity, price_coins, metadata, sort_order)
VALUES
  ('emote_pack_tilt', 'emote_pack', 'Tilt Pack', 'Spicy BM emotes from the existing Tilt pack.', 'premium', 1500, '{"packId":"tilt"}', 10),
  ('emote_pack_clutch', 'emote_pack', 'Clutch Pack', 'High-energy win momentum emotes from the existing Clutch pack.', 'premium', 1800, '{"packId":"clutch"}', 11),
  ('hit_lightning_strike', 'hit_effect', 'Lightning Strike', 'A crisp electric arc on damaging hits.', 'common', 350, '{"effectId":"lightning_strike","preview":"bolt"}', 20),
  ('hit_fire_burst', 'hit_effect', 'Fire Burst', 'A quick ember pop on impact.', 'rare', 500, '{"effectId":"fire_burst","preview":"flame"}', 21),
  ('hit_pixel_glitch', 'hit_effect', 'Pixel Glitch', 'A compact digital glitch burst.', 'rare', 650, '{"effectId":"pixel_glitch","preview":"glitch"}', 22),
  ('skin_flash_neon', 'avatar_skin', 'Neon Flash Skin', 'A lightweight profile/battle tint for Flash players.', 'common', 700, '{"skinId":"flash_neon","avatarId":"flash"}', 30),
  ('skin_guardian_emerald', 'avatar_skin', 'Emerald Guardian Skin', 'A subtle emerald skin for Guardian players.', 'common', 700, '{"skinId":"guardian_emerald","avatarId":"guardian"}', 31)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  rarity = EXCLUDED.rarity,
  price_coins = EXCLUDED.price_coins,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE public.coin_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_shop_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "coin_shop_items_read_all"
    ON public.coin_shop_items
    FOR SELECT
    USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_cosmetic_items_select_own"
    ON public.user_cosmetic_items
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "coin_shop_purchases_select_own"
    ON public.coin_shop_purchases
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purchase_coin_shop_item(p_user_id uuid, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item_row public.coin_shop_items%ROWTYPE;
  wallet_row public.player_wallets%ROWTYPE;
  target_pack_id text;
  granted_id text;
  grant_inserted boolean := false;
BEGIN
  SELECT * INTO item_row
  FROM public.coin_shop_items
  WHERE id = p_item_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop item not found.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.player_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO wallet_row
  FROM public.player_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF wallet_row.coins < item_row.price_coins THEN
    RAISE EXCEPTION 'Insufficient coins.' USING ERRCODE = 'P0001';
  END IF;

  IF item_row.item_type = 'emote_pack' THEN
    target_pack_id := item_row.metadata->>'packId';
    IF target_pack_id IS NULL OR target_pack_id NOT IN ('tilt', 'clutch') THEN
      RAISE EXCEPTION 'Invalid emote pack item.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.user_emote_packs
      WHERE user_emote_packs.user_id = p_user_id
        AND user_emote_packs.pack_id = target_pack_id
    ) THEN
      RAISE EXCEPTION 'Item already owned.' USING ERRCODE = '23505';
    END IF;
    granted_id := target_pack_id;
  ELSE
    granted_id := COALESCE(item_row.metadata->>'effectId', item_row.metadata->>'skinId', item_row.id);
    IF EXISTS (
      SELECT 1 FROM public.user_cosmetic_items
      WHERE user_id = p_user_id AND item_type = item_row.item_type AND item_id = granted_id
    ) THEN
      RAISE EXCEPTION 'Item already owned.' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF item_row.item_type = 'emote_pack' THEN
    INSERT INTO public.user_emote_packs (user_id, pack_id, source)
    VALUES (p_user_id, granted_id, 'coin_shop')
    ON CONFLICT (user_id, pack_id) DO NOTHING
    RETURNING true INTO grant_inserted;
  ELSE
    INSERT INTO public.user_cosmetic_items (user_id, item_type, item_id, source)
    VALUES (p_user_id, item_row.item_type, granted_id, 'coin_shop')
    ON CONFLICT (user_id, item_type, item_id) DO NOTHING
    RETURNING true INTO grant_inserted;
  END IF;

  IF NOT COALESCE(grant_inserted, false) THEN
    RAISE EXCEPTION 'Item already owned.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.player_wallets
  SET coins = coins - item_row.price_coins, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO wallet_row;

  INSERT INTO public.coin_shop_purchases (user_id, item_id, price_coins)
  VALUES (p_user_id, item_row.id, item_row.price_coins)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN jsonb_build_object(
    'itemId', item_row.id,
    'itemType', item_row.item_type,
    'grantedId', granted_id,
    'wallet', jsonb_build_object('coins', wallet_row.coins, 'xp', wallet_row.xp)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_coin_shop_item(p_user_id uuid, p_item_type text, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_id text := p_item_id;
BEGIN
  IF p_item_type = 'emote_pack' THEN
    IF normalized_id NOT IN ('starter', 'tilt', 'clutch') THEN
      RAISE EXCEPTION 'Invalid emote pack.' USING ERRCODE = 'P0001';
    END IF;
    IF normalized_id <> 'starter' AND NOT EXISTS (
      SELECT 1 FROM public.user_emote_packs WHERE user_id = p_user_id AND pack_id = normalized_id
    ) THEN
      RAISE EXCEPTION 'Emote pack not owned.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.players SET emote_pack = normalized_id WHERE auth_user_id = p_user_id;
  ELSIF p_item_type = 'hit_effect' THEN
    IF normalized_id <> 'none' AND NOT EXISTS (
      SELECT 1 FROM public.user_cosmetic_items
      WHERE user_id = p_user_id AND item_type = 'hit_effect' AND item_id = normalized_id
    ) THEN
      RAISE EXCEPTION 'Hit effect not owned.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.players SET hit_effect = normalized_id WHERE auth_user_id = p_user_id;
  ELSIF p_item_type = 'avatar_skin' THEN
    IF normalized_id <> 'none' AND NOT EXISTS (
      SELECT 1 FROM public.user_cosmetic_items
      WHERE user_id = p_user_id AND item_type = 'avatar_skin' AND item_id = normalized_id
    ) THEN
      RAISE EXCEPTION 'Avatar skin not owned.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.players SET avatar_skin = normalized_id WHERE auth_user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Invalid equip type.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('equipped', true, 'itemType', p_item_type, 'itemId', normalized_id);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_coin_shop_item(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.equip_coin_shop_item(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_coin_shop_item(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.equip_coin_shop_item(uuid, text, text) TO service_role;
