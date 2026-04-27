import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateMatchRewards, type MatchRewardsClaimResponse } from "@/lib/match-rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

type ClaimBody = {
  matchToken: string;
  result: "win" | "loss" | "draw";
  correctAnswers: number;
  peakStreak: number;
  isKo?: boolean;
  isComeback?: boolean;
  isAiMatch?: boolean;
};

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

    let body: ClaimBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { matchToken, result, correctAnswers, peakStreak, isKo, isComeback, isAiMatch } = body;

    if (!matchToken || typeof matchToken !== "string" || matchToken.length < 4) {
      return NextResponse.json({ error: "Invalid match token." }, { status: 400 });
    }
    if (!["win", "loss", "draw"].includes(result)) {
      return NextResponse.json({ error: "Invalid result." }, { status: 400 });
    }
    if (typeof correctAnswers !== "number" || correctAnswers < 0 || correctAnswers > 500) {
      return NextResponse.json({ error: "Invalid correctAnswers." }, { status: 400 });
    }
    if (typeof peakStreak !== "number" || peakStreak < 0 || peakStreak > 100) {
      return NextResponse.json({ error: "Invalid peakStreak." }, { status: 400 });
    }

    // Server-side reward calculation — client cannot manipulate amounts
    const breakdown = calculateMatchRewards({
      result,
      correctAnswers,
      peakStreak,
      isKo: isKo === true,
      isComeback: isComeback === true,
      isAiMatch: isAiMatch === true,
    });

    const { data, error } = await supabase.rpc("award_match_rewards", {
      p_user_id: userData.user.id,
      p_match_token: matchToken,
      p_xp: breakdown.totalXp,
      p_coins: breakdown.totalCoins,
      p_result: result,
      p_is_ai_match: isAiMatch === true,
    });

    if (error) {
      // Unique constraint violation = already claimed
      if (error.code === "23505" || error.message?.toLowerCase().includes("unique")) {
        return NextResponse.json({ error: "Rewards already claimed for this match." }, { status: 409 });
      }
      console.error("[match-rewards] award_match_rewards failed", error);
      return NextResponse.json({ error: "Failed to award rewards." }, { status: 500 });
    }

    const rpcResult = data as {
      xpAwarded: number;
      coinsAwarded: number;
      levelBefore: number;
      levelAfter: number;
      leveledUp: boolean;
      wallet: { xp: number; coins: number; level: number };
    };

    const response: MatchRewardsClaimResponse = {
      xpAwarded: rpcResult.xpAwarded,
      coinsAwarded: rpcResult.coinsAwarded,
      levelBefore: rpcResult.levelBefore,
      levelAfter: rpcResult.levelAfter,
      leveledUp: rpcResult.leveledUp,
      wallet: rpcResult.wallet,
      breakdown,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[match-rewards] claim crashed", error);
    return NextResponse.json({ error: "Unable to claim match rewards." }, { status: 500 });
  }
}
