import { NextResponse } from "next/server";
import { getStripe, getStripePriceIdForAvatar, getStripePriceIdForCoinPack, getStripePriceIdForPack, STRIPE_COIN_PACKS } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getURL } from "@/lib/site-url";

export const runtime = "nodejs";

type Body = {
  pack?: string;
  packId?: string;
  itemType?: "emote_pack" | "avatar" | "coins";
  itemId?: string;
};

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (data.user.is_anonymous) {
      return NextResponse.json({ error: "Guest users cannot make purchases." }, { status: 403 });
    }

    const body = (await request.json()) as Body;
    const itemType = body.itemType ?? (body.pack || body.packId ? "emote_pack" : undefined);
    const itemId = String(body.itemId ?? body.pack ?? body.packId ?? "");
    if (!itemType || !itemId) {
      return NextResponse.json({ error: "Invalid purchase." }, { status: 400 });
    }

    const isEmotePack = itemType === "emote_pack";
    const isAvatar = itemType === "avatar";
    const isCoins = itemType === "coins";
    if (!isEmotePack && !isAvatar && !isCoins) {
      return NextResponse.json({ error: "Invalid purchase." }, { status: 400 });
    }

    const priceId = isEmotePack
      ? getStripePriceIdForPack(itemId)
      : isAvatar
        ? getStripePriceIdForAvatar(itemId)
        : getStripePriceIdForCoinPack(itemId);
    if (!priceId) {
      return NextResponse.json({ error: "Invalid purchase item." }, { status: 400 });
    }

    // Prevent duplicate ownership (best-effort; webhook is source of truth)
    if (isEmotePack) {
      if (itemId !== "tilt" && itemId !== "clutch") {
        return NextResponse.json({ error: "Invalid pack." }, { status: 400 });
      }
      const { data: existing } = await supabaseAdmin
        .from("user_emote_packs")
        .select("id")
        .eq("user_id", data.user.id)
        .eq("pack_id", itemId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: "Pack already owned." }, { status: 409 });
      }
    } else if (isAvatar) {
      if (itemId !== "architect" && itemId !== "titan") {
        return NextResponse.json({ error: "Invalid avatar." }, { status: 400 });
      }
      const { data: existing } = await supabaseAdmin
        .from("user_avatars")
        .select("avatar_id")
        .eq("user_id", data.user.id)
        .eq("avatar_id", itemId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: "Avatar already owned." }, { status: 409 });
      }
    } else if (isCoins) {
      if (!Object.prototype.hasOwnProperty.call(STRIPE_COIN_PACKS, itemId)) {
        return NextResponse.json({ error: "Invalid coin pack." }, { status: 400 });
      }
    }

    const stripe = getStripe();
    const metadata: Record<string, string> = {
      user_id: data.user.id,
      item_type: itemType,
      item_id: itemId,
    };

    // Back-compat (older webhook logic / dashboards)
    if (isEmotePack) {
      metadata.pack_id = itemId;
    }
    if (isCoins) {
      metadata.coins_amount = String(STRIPE_COIN_PACKS[itemId as keyof typeof STRIPE_COIN_PACKS].coins);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: isCoins
        ? getURL(`/shop/coins/success?session_id={CHECKOUT_SESSION_ID}`)
        : getURL(`/profile?purchase=success&session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: isCoins ? getURL("/shop/coins/cancel") : getURL("/profile?purchase=cancel"),
      metadata,
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

