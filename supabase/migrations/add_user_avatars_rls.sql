-- Premium avatar ownership: ensure table exists, enable RLS, allow users to read their own rows.
-- The web app loads owned avatars with the user's JWT; without a SELECT policy, the query returns
-- no rows and premium characters stay locked even when rows exist in user_avatars.

CREATE TABLE IF NOT EXISTS public.user_avatars (
  user_id uuid NOT NULL,
  avatar_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, avatar_id)
);

ALTER TABLE public.user_avatars ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "user_avatars_select_own"
    ON public.user_avatars
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
