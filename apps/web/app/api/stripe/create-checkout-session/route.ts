import { NextResponse } from "next/server";
import { getStripe, getStripePriceIdForPack } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getURL } from "@/lib/site-url";

export const runtime = "nodejs";

type Body = {
  packId?: string;
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
    const packId = String(body.packId ?? "");
    const priceId = getStripePriceIdForPack(packId);
    if (!priceId) {
      return NextResponse.json({ error: "Invalid pack." }, { status: 400 });
    }

    // Prevent duplicate ownership (best-effort, webhook remains source of truth)
    const { data: existing } = await supabaseAdmin
      .from("user_emote_packs")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("pack_id", packId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Pack already owned." }, { status: 409 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: getURL(`/shop/success?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: getURL("/shop/cancel"),
      metadata: {
        user_id: data.user.id,
        pack_id: packId,
      },
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

