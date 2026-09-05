-- Previews & recaps, phase 0 — see docs/PREVIEWS_RECAPS_PLAN.md.
--
-- Replaces the flat MDX files in data/newsfeed/ with a Supabase-backed model. The content is
-- already rigidly structured (every article is 5-6 matchup sections with the same shape; see the
-- plan's §2.2 audit), so matchups are rows rather than an opaque markdown blob — that's what makes
-- the scoreboard UI, season filtering, and eventual ESPN autofill possible at all.
--
-- Everything for both tables ships in THIS ONE migration on purpose. Migration 010 split the poll's
-- policies across files and silently dropped members' SELECT access for weeks (docs/POLL_SYSTEM_PLAN.md
-- §3, P0) — undetected because all testing was done as the commissioner, who bypasses RLS via a
-- FOR ALL policy. Acceptance for this migration therefore requires testing as all three of:
-- (a) anonymous, (b) a plain `admin` member, (c) the commissioner.

CREATE TYPE article_kind   AS ENUM ('preview', 'recap');
CREATE TYPE article_status AS ENUM ('draft', 'published');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE articles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year    INTEGER NOT NULL,
  week_number    INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 30),
  kind           article_kind NOT NULL,
  -- Stored, not derived from (season, week, kind): the backfill seeds it from today's file paths
  -- so every existing URL (/newsfeed/2025/week-one-preview) keeps working. That also preserves
  -- Giscus comment threads, which components/Comments.tsx keys on slug.
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT,
  -- Escape hatch for the ~5% of content that isn't a matchup (a season-opener intro, an awards
  -- section). The matchup rows are the spine; this keeps freeform possible without giving up
  -- structure everywhere else.
  intro_markdown TEXT,
  outro_markdown TEXT,
  status         article_status NOT NULL DEFAULT 'draft',
  published_at   TIMESTAMPTZ,
  -- Doubles as the assignment and the byline. The commissioner creates the row with this set;
  -- that member is then the only non-commissioner who can see or edit it. A separate assigned_to
  -- column would only earn its keep if writeups were routinely ghost-written, which they aren't.
  author_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Optional link to data/authors/*.mdx for the rendered byline (avatar, twitter). Kept separate
  -- from author_id because the Contentlayer Authors docs are not Supabase users.
  author_slug    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug),
  -- Makes assignment exclusive: once Week 5's recap is assigned, a second one cannot be created.
  -- Also what makes the preview<->recap cross-link a guaranteed lookup rather than a heuristic.
  UNIQUE (season_year, week_number, kind)
);

CREATE TABLE article_matchups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id     UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL CHECK (position >= 1),
  -- The '## TNF (Prime)' / '## Shitter bowl (FOX)' heading. Free text on purpose — it's editorial.
  slot_label     TEXT,
  -- Display source of truth, frozen at the week it was written. teams only holds the 2026 season
  -- (005), articles go back to 2023, and league team names change mid-season — so the name is
  -- required text and the FK below is an optional enrichment link, not the identity.
  away_team_name TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  away_team_id   UUID REFERENCES teams(id) ON DELETE SET NULL,
  home_team_id   UUID REFERENCES teams(id) ON DELETE SET NULL,
  away_record    TEXT,
  home_record    TEXT,
  -- Text, not numeric: it's written 'CM -13.1' — a favorite plus a number, and occasionally
  -- editorial. Splitting it into columns buys nothing and loses the files that write it differently.
  line           TEXT,
  -- Numeric, unlike `line`: these ARE used arithmetically (winner highlighting, margin,
  -- high-score-of-the-week). Recaps only; NULL on previews.
  away_score     NUMERIC(6, 2),
  home_score     NUMERIC(6, 2),
  body           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, position)
);

CREATE INDEX idx_articles_season_week ON articles (season_year DESC, week_number DESC);
CREATE INDEX idx_articles_status      ON articles (status, published_at DESC);
CREATE INDEX idx_articles_author      ON articles (author_id) WHERE status = 'draft';
CREATE INDEX idx_matchups_article     ON article_matchups (article_id, position);

-- The poll tables declare `updated_at` but nothing ever maintains it (001), so the column is
-- decorative there. Doing it properly here rather than inheriting that.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER articles_set_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER article_matchups_set_updated_at
  BEFORE UPDATE ON article_matchups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Shared predicates (same pattern as poll_week_is_open() / jwt_has_role())
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.article_is_published(p_article_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id = p_article_id AND a.status = 'published'
  )
$$;

-- "This article is mine and still editable." Used by every article_matchups write policy so the
-- three can't drift apart the way the poll's INSERT drifted from UPDATE/DELETE (see 015's F2).
CREATE OR REPLACE FUNCTION public.article_is_own_draft(p_article_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id = p_article_id
      AND a.author_id = auth.uid()
      AND a.status = 'draft'
  )
$$;

CREATE OR REPLACE FUNCTION public.article_is_own(p_article_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id = p_article_id AND a.author_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE articles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_matchups ENABLE ROW LEVEL SECURITY;

-- Public read of published articles only. Drafts are invisible to anon entirely.
CREATE POLICY "Public can view published articles"
  ON articles FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Public can view published article matchups"
  ON article_matchups FOR SELECT
  TO anon, authenticated
  USING (public.article_is_published(article_id));

-- An assigned writer can see their own draft before it goes public.
CREATE POLICY "Authors can view own articles"
  ON articles FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Authors can view own article matchups"
  ON article_matchups FOR SELECT
  TO authenticated
  USING (public.article_is_own(article_id));

-- NOTE: no INSERT policy for `authenticated` on articles, and that is the whole assignment
-- mechanism. RLS defaults to deny with no policy present (the same technique 021 used to force
-- ballots through submit_poll_ballot), so only the commissioner's FOR ALL policy below can create
-- an article. A member writes the week they were handed, and cannot invent one.
--
-- WITH CHECK requires the result to still be a draft owned by the same person, which means:
--   * an author can freely edit their own draft;
--   * an author cannot reassign it to someone else;
--   * an author cannot flip status to 'published' directly — that must go through
--     publish_article() below, which validates the article is actually complete;
--   * an author CAN set a published article back to 'draft' (the Unpublish action), then edit it.
-- RLS cannot compare OLD to NEW, so this pair of clauses is how the transition is constrained.
CREATE POLICY "Authors can update own articles"
  ON articles FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND status = 'draft');

-- Deleting is limited to drafts: a published article is league history, and removing one is a
-- commissioner action.
CREATE POLICY "Authors can delete own drafts"
  ON articles FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() AND status = 'draft');

CREATE POLICY "Authors can create own draft matchups"
  ON article_matchups FOR INSERT
  TO authenticated
  WITH CHECK (public.article_is_own_draft(article_id));

CREATE POLICY "Authors can update own draft matchups"
  ON article_matchups FOR UPDATE
  TO authenticated
  USING (public.article_is_own_draft(article_id))
  WITH CHECK (public.article_is_own_draft(article_id));

CREATE POLICY "Authors can delete own draft matchups"
  ON article_matchups FOR DELETE
  TO authenticated
  USING (public.article_is_own_draft(article_id));

-- Commissioner: assigns articles (the only role that can INSERT), and can correct or remove
-- anyone's, published or not.
CREATE POLICY "Commissioner can manage all articles"
  ON articles FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'))
  WITH CHECK (public.jwt_has_role('commissioner'));

CREATE POLICY "Commissioner can manage all article matchups"
  ON article_matchups FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'))
  WITH CHECK (public.jwt_has_role('commissioner'));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Slug generation lives in one place so assignment and the backfill script can't disagree.
-- Word-numbers ('week-one') rather than digits, to match the three seasons of existing file-derived
-- slugs the backfill preserves verbatim — new URLs then look like old ones instead of the archive
-- splitting into two naming conventions. Falls back to the digit past the word list.
CREATE OR REPLACE FUNCTION public.article_slug(
  p_season_year INTEGER,
  p_week_number INTEGER,
  p_kind article_kind
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_words text[] := ARRAY[
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen'
  ];
  v_word text;
BEGIN
  v_word := COALESCE(v_words[p_week_number], p_week_number::text);
  RETURN p_season_year || '/week-' || v_word || '-' || p_kind::text;
END;
$$;

-- Assignment: the commissioner hands a week to a member. An assignment is not its own concept —
-- it is an empty draft with a name on it, which is why this just inserts an articles row.
-- Exists as an RPC rather than a bare insert so slug and default title are generated in one place.
CREATE OR REPLACE FUNCTION public.assign_article(
  p_season_year INTEGER,
  p_week_number INTEGER,
  p_kind article_kind,
  p_author_id UUID
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_article_id uuid;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the check the commissioner FOR ALL policy would have done
  -- is re-implemented here. Same pattern as submit_poll_ballot (020).
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_author_id) THEN
    RAISE EXCEPTION 'No such league member';
  END IF;

  INSERT INTO public.articles (season_year, week_number, kind, slug, title, status, author_id)
  VALUES (
    p_season_year,
    p_week_number,
    p_kind,
    public.article_slug(p_season_year, p_week_number, p_kind),
    p_season_year || ' Week ' || p_week_number || ' ' || initcap(p_kind::text),
    'draft',
    p_author_id
  )
  RETURNING id INTO v_article_id;

  RETURN v_article_id;
EXCEPTION
  WHEN unique_violation THEN
    -- UNIQUE (season_year, week_number, kind) — the exclusivity that makes assignment meaningful.
    RAISE EXCEPTION 'That week already has a % assigned', p_kind::text;
END;
$$;

-- Publishing is a transaction, not a status flip: it has to validate the article is actually
-- complete and stamp published_at atomically. Same reasoning as submit_poll_ballot (020), and the
-- reason the author UPDATE policy above forbids setting status = 'published' directly.
CREATE OR REPLACE FUNCTION public.publish_article(p_article_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_article public.articles;
  v_matchup_count integer;
BEGIN
  -- FOR UPDATE locks the row so a concurrent reassignment or delete can't commit between this
  -- check and the write below (the TOCTOU gap 023 closed on the poll side).
  SELECT * INTO v_article FROM public.articles WHERE id = p_article_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article not found';
  END IF;

  IF v_article.author_id IS DISTINCT FROM auth.uid() AND NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'This article is assigned to someone else';
  END IF;

  SELECT count(*) INTO v_matchup_count
  FROM public.article_matchups WHERE article_id = p_article_id;

  IF v_matchup_count = 0 THEN
    RAISE EXCEPTION 'Add at least one matchup before publishing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.article_matchups
    WHERE article_id = p_article_id AND btrim(body) = ''
  ) THEN
    RAISE EXCEPTION 'Every matchup needs a writeup before publishing';
  END IF;

  UPDATE public.articles
  SET status = 'published',
      -- COALESCE, so re-publishing after an edit keeps the original publish date rather than
      -- silently jumping the article back to the top of the feed.
      published_at = COALESCE(published_at, now())
  WHERE id = p_article_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_article(integer, integer, article_kind, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_article(uuid) TO authenticated;
