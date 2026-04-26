import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CoinShopItemType } from "@/lib/coin-shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function isEquipType(value: string): value is CoinShopItemType {
  return value === "emote_pack" || value === "hit_effect" || value === "avatar_skin";
}

function getEquipError(message?: string) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("not owned")) {
    return { message: "Unlock that item before equipping it.", status: 403 };
  }
  if (normalized.includes("invalid")) {
    return { message: "That item cannot be equipped.", status: 400 };
  }
  return { message: "Unable to equip item.", status: 500 };
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const body = (await request.json()) as { itemType?: string; itemId?: string };
    const itemType = typeof body.itemType === "string" ? body.itemType : "";
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    if (!isEquipType(itemType) || !itemId) {
      return NextResponse.json({ error: "Invalid equip request." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("equip_coin_shop_item", {
      p_user_id: userData.user.id,
      p_item_type: itemType,
      p_item_id: itemId,
    });

    if (error) {
      const mapped = getEquipError(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[coin-shop] equip crashed", error);
    return NextResponse.json({ error: "Unable to equip item." }, { status: 500 });
  }
}
