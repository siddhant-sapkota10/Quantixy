import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
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

    const { data, error } = await supabase.rpc("touch_daily_reward_login", {
      p_user_id: userData.user.id,
    });

    if (error) {
      console.error("[daily-rewards] status failed", error);
      return NextResponse.json({ error: "Unable to load daily rewards." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[daily-rewards] status crashed", error);
    return NextResponse.json({ error: "Unable to load daily rewards." }, { status: 500 });
  }
}
