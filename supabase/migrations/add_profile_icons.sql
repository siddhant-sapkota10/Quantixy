-- Dedicated profile icons for leaderboard/profile identity.
-- Keeps gameplay avatar selection separate from public profile presentation.

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS profile_icon_mode text NOT NULL DEFAULT 'monogram';

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS profile_icon_emoji text;

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS profile_icon_text text;

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS profile_icon_image_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'players_profile_icon_mode_check'
  ) THEN
    ALTER TABLE public.players
    ADD CONSTRAINT players_profile_icon_mode_check
    CHECK (profile_icon_mode IN ('emoji', 'monogram', 'image'));
  END IF;
END $$;

UPDATE public.players
SET profile_icon_mode = 'monogram'
WHERE profile_icon_mode IS NULL
   OR profile_icon_mode NOT IN ('emoji', 'monogram', 'image');

UPDATE public.players
SET profile_icon_text = upper(left(coalesce(nullif(display_name, ''), nullif(username, ''), 'Q'), 2))
WHERE profile_icon_text IS NULL
   OR btrim(profile_icon_text) = '';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-icons',
  'profile-icons',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  CREATE POLICY "profile_icons_public_read"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'profile-icons');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profile_icons_insert_own"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'profile-icons'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profile_icons_update_own"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'profile-icons'
      AND auth.uid()::text = (storage.foldername(name))[1]
    )
    WITH CHECK (
      bucket_id = 'profile-icons'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profile_icons_delete_own"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'profile-icons'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
