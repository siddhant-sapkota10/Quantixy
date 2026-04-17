import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sessionId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
    const sessionId = String(body.sessionId ?? "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId) as Stripe.Checkout.Session;
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const paymentStatus = session.payment_status;
    if (paymentStatus !== "paid") {
      return NextResponse.json({ status: "pending" });
    }

    const userId = String(session.metadata?.user_id ?? "");
    const itemType = String(session.metadata?.item_type ?? (session.metadata?.pack_id ? "emote_pack" : ""));
    const itemId = String(session.metadata?.item_id ?? session.metadata?.pack_id ?? "");

    if (!userId || !itemType || !itemId) {
      return NextResponse.json({ error: "Missing metadata." }, { status: 400 });
    }
    if (!isUuid(userId)) {
      return NextResponse.json({ error: "Invalid user_id metadata." }, { status: 400 });
    }
    if (userId !== data.user.id) {
      return NextResponse.json({ error: "Session does not belong to this user." }, { status: 403 });
    }

    // Safe + instant: if session is paid and belongs to this user, grant ownership here too (idempotent).
    if (itemType === "avatar") {
      if (itemId !== "architect" && itemId !== "titan") {
        return NextResponse.json({ error: "Invalid avatar purchase item." }, { status: 400 });
      }
      const { error: upsertError } = await supabaseAdmin
        .from("user_avatars")
        .upsert({ user_id: userId, avatar_id: itemId } as never, { onConflict: "user_id,avatar_id" });
      if (upsertError) {
        return NextResponse.json({ error: "Failed to grant avatar ownership." }, { status: 500 });
      }
      return NextResponse.json({
        status: "confirmed",
        itemType,
        itemId,
      });
    }

    if (itemType === "emote_pack") {
      if (itemId !== "tilt" && itemId !== "clutch") {
        return NextResponse.json({ error: "Invalid emote pack purchase item." }, { status: 400 });
      }
      const { error: upsertError } = await supabaseAdmin
        .from("user_emote_packs")
        .upsert(
          {
            user_id: userId,
            pack_id: itemId,
            source: "stripe_checkout_confirm",
            stripe_checkout_session_id: session.id,
          } as never,
          { onConflict: "user_id,pack_id" }
        );
      if (upsertError) {
        return NextResponse.json({ error: "Failed to grant pack ownership." }, { status: 500 });
      }
      return NextResponse.json({
        status: "confirmed",
        itemType,
        itemId,
      });
    }

    return NextResponse.json({ error: "Invalid itemType." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to confirm purchase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

