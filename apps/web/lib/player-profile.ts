"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getProfileUsername } from "@/lib/auth";
import { normalizeAvatarId } from "@/lib/avatars";
import { getSupabaseClient } from "@/lib/supabase";
import { TOPICS, type Topic } from "@/lib/topics";

type RatingRow = {
  topic: Topic;
  rating: number;
};

type PlayerProfile = {
  id: string;
  username: string;
  avatarId: string;
  ratings: RatingRow[];
};

type PlayerRow = {
  id: string;
  username: string;
  avatar_id: string;
};

type RatingQueryRow = {
  topic: Topic;
  rating: number;
};

export function usePlayerProfile(user?: User | null) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const supabase = getSupabaseClient();

    const loadProfile = async () => {
      try {
        setLoading(true);

        const { data: player, error: playerError } = await supabase
          .from("players")
          .select("id, username, avatar_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (playerError) {
          throw playerError;
        }

        let currentPlayer = player as PlayerRow | null;

        if (!currentPlayer) {
          const fallbackUsername = getProfileUsername(user);
          const { data: insertedPlayer, error: insertError } = await supabase
            .from("players")
            .insert(
              {
                auth_user_id: user.id,
                username: fallbackUsername
              } as never
            )
            .select("id, username, avatar_id")
            .single();

          if (insertError && insertError.code !== "23505") {
            throw insertError;
          }

          if (insertError?.code === "23505") {
            const { data: retryPlayer, error: retryError } = await supabase
              .from("players")
              .select("id, username, avatar_id")
              .eq("auth_user_id", user.id)
              .maybeSingle();

            if (retryError) {
              throw retryError;
            }

            currentPlayer = retryPlayer as PlayerRow | null;
          } else {
            currentPlayer = insertedPlayer as PlayerRow | null;
          }
        }

        if (!currentPlayer) {
          setProfile(null);
          return;
        }

        const { data: ratings, error: ratingsError } = await supabase
          .from("ratings")
          .select("topic, rating")
          .eq("player_id", currentPlayer.id);

        if (ratingsError) {
          throw ratingsError;
        }

        const ratingRows = (ratings ?? []) as RatingQueryRow[];
        const ratingMap = new Map(ratingRows.map((entry) => [entry.topic, entry.rating]));

        setProfile({
          id: currentPlayer.id,
          username: currentPlayer.username,
          avatarId: normalizeAvatarId(currentPlayer.avatar_id),
          ratings: TOPICS.map((topic) => ({
            topic,
            rating: ratingMap.get(topic) ?? 1000
          }))
        });
      } catch {
        setProfile(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      controller.abort();
    };
  }, [user]);

  return {
    profile,
    loading
  };
}
