import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function getPurchaseError(message?: string) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("insufficient")) {
    return { message: "Not enough coins for that item.", status: 402 };
  }
  if (normalized.includes("already owned") || normalized.includes("duplicate key")) {
    return { message: "You already own that item.", status: 409 };
  }
  if (normalized.includes("not found") || normalized.includes("invalid")) {
    return { message: "That shop item is not available.", status: 400 };
  }
  return { message: "Unable to complete coin purchase.", status: 500 };
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const body = (await request.json()) as { itemId?: string };
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    if (!itemId) {
      return NextResponse.json({ error: "Missing shop item." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }
    if (userData.user.is_anonymous) {
      return NextResponse.json({ error: "Guest accounts cannot buy shop items." }, { status: 403 });
    }

    const { data, error } = await supabase.rpc("purchase_coin_shop_item", {
      p_user_id: userData.user.id,
      p_item_id: itemId,
    });

    if (error) {
      const mapped = getPurchaseError(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[coin-shop] purchase crashed", error);
    return NextResponse.json({ error: "Unable to complete coin purchase." }, { status: 500 });
  }
}
