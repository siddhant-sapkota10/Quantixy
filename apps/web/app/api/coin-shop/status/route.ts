import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  COIN_SHOP_SEED_ROWS,
  DEFAULT_AVATAR_SKIN_ID,
  DEFAULT_HIT_EFFECT_ID,
  getFreeStarterPackShopItem,
  normalizeShopItem,
  sortShopItems,
  type CoinShopEquipped,
  type CoinShopStatus,
} from "@/lib/coin-shop";
import { normalizeEmotePackId } from "@/lib/cosmetics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const userId = userData.user.id;

    await supabase.from("player_wallets").upsert({ user_id: userId }, { onConflict: "user_id" });

    let [itemsResult, walletResult, emotePacksResult, cosmeticsResult, playerResult] = await Promise.all([
      supabase
        .from("coin_shop_items")
        .select("id, item_type, name, description, rarity, price_coins, metadata, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("player_wallets").select("coins, xp").eq("user_id", userId).maybeSingle(),
      supabase.from("user_emote_packs").select("pack_id").eq("user_id", userId),
      supabase.from("user_cosmetic_items").select("item_type, item_id").eq("user_id", userId),
      supabase.from("players").select("avatar, emote_pack, hit_effect, avatar_skin").eq("auth_user_id", userId).maybeSingle(),
    ]);

    const avatarsResult = await supabase.from("user_avatars").select("avatar_id").eq("user_id", userId);

    if (itemsResult.error) {
      console.error("[coin-shop] status items failed", itemsResult.error);
      return NextResponse.json(
        { error: "Coin shop migration has not been applied yet." },
        { status: 503 }
      );
    }

    if ((itemsResult.data ?? []).length === 0) {
      const { error: seedError } = await supabase
        .from("coin_shop_items")
        .upsert(
          COIN_SHOP_SEED_ROWS.map((item) => ({
            ...item,
            is_active: true,
          })),
          { onConflict: "id" }
        );

      if (seedError) {
        console.error("[coin-shop] seed repair failed", seedError);
      } else {
        itemsResult = await supabase
          .from("coin_shop_items")
          .select("id, item_type, name, description, rarity, price_coins, metadata, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
      }
    }

    const ownedEmotePacks = Array.from(
      new Set(["starter", ...((emotePacksResult.data ?? []) as Array<{ pack_id: string }>).map((row) => row.pack_id)])
    );
    const cosmeticRows = (cosmeticsResult.data ?? []) as Array<{ item_type: string; item_id: string }>;
    const playerRow = playerResult.data as
      | { avatar?: string | null; emote_pack?: string | null; hit_effect?: string | null; avatar_skin?: string | null }
      | null;

    const equipped: CoinShopEquipped = {
      avatar: playerRow?.avatar ?? "flash",
      emotePack: normalizeEmotePackId(playerRow?.emote_pack),
      hitEffect: playerRow?.hit_effect ?? DEFAULT_HIT_EFFECT_ID,
      avatarSkin: playerRow?.avatar_skin ?? DEFAULT_AVATAR_SKIN_ID,
      title: "rookie_solver",
    };

    const dbItems = (itemsResult.data ?? []).map((row) => normalizeShopItem(row as never));
    const items = [getFreeStarterPackShopItem(), ...dbItems].sort(sortShopItems);
    const walletRow = walletResult.data as { coins?: number | null; xp?: number | null } | null;

    const status: CoinShopStatus = {
      wallet: {
        coins: walletRow?.coins ?? 0,
        xp: walletRow?.xp ?? 0,
      },
      items,
      owned: {
        emotePacks: ownedEmotePacks,
        hitEffects: cosmeticRows
          .filter((row) => row.item_type === "hit_effect")
          .map((row) => row.item_id),
        avatarSkins: cosmeticRows
          .filter((row) => row.item_type === "avatar_skin")
          .map((row) => row.item_id),
        avatars: Array.from(
          new Set([
            "flash",
            "shadow",
            "guardian",
            "inferno",
            ...((avatarsResult.data ?? []) as Array<{ avatar_id: string }>).map((row) => row.avatar_id),
          ])
        ),
      },
      equipped,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error("[coin-shop] status crashed", error);
    return NextResponse.json({ error: "Unable to load coin shop." }, { status: 500 });
  }
}
