-- Migration: question system catalog + analytics
-- This is OPTIONAL: core generation stays in code for speed/determinism.
-- Use this to track attempts, balance, and evolve families safely.

-- 1) Topics catalog (school-math taxonomy)
CREATE TABLE IF NOT EXISTS public.question_topics (
  id text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Question family catalog (what the code generates)
CREATE TABLE IF NOT EXISTS public.question_families (
  id text PRIMARY KEY,
  topic_id text NOT NULL REFERENCES public.question_topics(id) ON DELETE CASCADE,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  weight int NOT NULL DEFAULT 1 CHECK (weight > 0),
  answer_type text NOT NULL DEFAULT 'text',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, difficulty, id)
);

CREATE INDEX IF NOT EXISTS question_families_topic_difficulty_idx
  ON public.question_families(topic_id, difficulty);

-- 3) Attempt analytics (fast PvP balancing)
-- Stores only what you need to evaluate balance: prompt hash, family, result, response time.
CREATE TABLE IF NOT EXISTS public.question_attempts (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  player_id uuid NULL REFERENCES public.players(id) ON DELETE SET NULL,
  match_id uuid NULL, -- optional: link to matches table if you have one; keep loose
  topic_id text NOT NULL REFERENCES public.question_topics(id) ON DELETE RESTRICT,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  family_id text NOT NULL,
  prompt text NOT NULL,
  correct_answer text NOT NULL,
  user_answer text NULL,
  is_correct boolean NOT NULL DEFAULT false,
  response_ms int NULL CHECK (response_ms >= 0)
);

CREATE INDEX IF NOT EXISTS question_attempts_topic_difficulty_created_idx
  ON public.question_attempts(topic_id, difficulty, created_at DESC);

CREATE INDEX IF NOT EXISTS question_attempts_player_created_idx
  ON public.question_attempts(player_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (recommended)
-- ---------------------------------------------------------------------------

ALTER TABLE public.question_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

-- Topics/families are safe to read publicly (static catalog)
DO $$ BEGIN
  CREATE POLICY "question_topics_read_all"
    ON public.question_topics
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "question_families_read_all"
    ON public.question_families
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Attempts: players can read their own attempts.
DO $$ BEGIN
  CREATE POLICY "question_attempts_read_own"
    ON public.question_attempts
    FOR SELECT
    USING (auth.uid() = player_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Attempts: allow a logged-in user to insert their own attempts.
-- If you prefer server-only writes, remove this policy and write via service role.
DO $$ BEGIN
  CREATE POLICY "question_attempts_insert_own"
    ON public.question_attempts
    FOR INSERT
    WITH CHECK (auth.uid() = player_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed topics (id = code topic key)
INSERT INTO public.question_topics (id, label, sort_order)
VALUES
  ('arithmetic',     'Arithmetic',                      10),
  ('algebra',        'Algebra',                         20),
  ('geometry',       'Geometry',                        30),
  ('fractions',      'Fractions / Decimals / %',        40),
  ('ratios',         'Ratios / Proportions',            50),
  ('exponents',      'Exponents / Roots',               60),
  ('statistics',     'Data / Statistics',               70),
  ('trigonometry',   'Trigonometry',                    80),
  ('functions',      'Functions / Graphs',              90),
  ('calculus',       'Calculus Basics',                100)
ON CONFLICT (id) DO NOTHING;

