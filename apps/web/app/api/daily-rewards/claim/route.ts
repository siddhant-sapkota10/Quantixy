import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function getClaimErrorMessage(message?: string) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("complete one match")) {
    return "Complete one match before claiming today's reward.";
  }
  if (normalized.includes("already claimed") || normalized.includes("duplicate key")) {
    return "Today's reward has already been claimed.";
  }
  return "Unable to claim today's reward.";
}

export async function POST(request: Request) {
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

    const { data, error } = await supabase.rpc("claim_daily_reward", {
      p_user_id: userData.user.id,
    });

    if (error) {
      const message = getClaimErrorMessage(error.message);
      const status = message.includes("already") ? 409 : message.includes("Complete") ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[daily-rewards] claim crashed", error);
    return NextResponse.json({ error: "Unable to claim today's reward." }, { status: 500 });
  }
}
