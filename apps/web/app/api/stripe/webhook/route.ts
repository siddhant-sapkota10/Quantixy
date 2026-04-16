import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentStatus = session.payment_status;
      if (paymentStatus !== "paid") {
        return NextResponse.json({ received: true });
      }

      const userId = String(session.metadata?.user_id ?? "");
      const packId = String(session.metadata?.pack_id ?? session.metadata?.pack ?? "");
      if (!userId || !packId) {
        return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
      }

      // Only allow paid packs via Stripe.
      if (packId !== "tilt" && packId !== "clutch") {
        return NextResponse.json({ error: "Invalid pack_id" }, { status: 400 });
      }

      const supabaseAdmin = getSupabaseAdmin();

      // Insert ownership (idempotent via UNIQUE(user_id, pack_id))
      const { error: ownershipError } = await supabaseAdmin
        .from("user_emote_packs")
        .upsert(
          {
            user_id: userId,
            pack_id: packId,
            source: "stripe_checkout",
            stripe_checkout_session_id: session.id,
          } as never,
          { onConflict: "user_id,pack_id" }
        );
      if (ownershipError) {
        console.error("[stripe-webhook] failed to upsert user_emote_packs", {
          eventId: event.id,
          sessionId: session.id,
          userId,
          packId,
          error: ownershipError,
        });
        throw new Error("Failed to write emote pack ownership.");
      }

      // Optional: also mirror into players.unlocked_emote_packs if the column exists.
      // This keeps older codepaths safe even if they still read the legacy column.
      const { data: player } = await supabaseAdmin
        .from("players")
        .select("id, unlocked_emote_packs")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (player?.id) {
        const current = Array.isArray((player as any).unlocked_emote_packs) ? (player as any).unlocked_emote_packs : [];
        const next = Array.from(new Set(["starter", ...current, packId]));
        const { error: legacyError } = await supabaseAdmin
          .from("players")
          .update({ unlocked_emote_packs: next } as never)
          .eq("id", player.id);
        if (legacyError) {
          console.error("[stripe-webhook] failed to mirror players.unlocked_emote_packs", {
            eventId: event.id,
            sessionId: session.id,
            playerId: player.id,
            userId,
            packId,
            error: legacyError,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

