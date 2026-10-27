-- Press conferences, Supabase-backed (issues #20, #33, #116).
--
-- Replaces data/projectsData.ts (a flat array requiring a PR to add an entry) with a real table,
-- so the commissioner can add a press conference from the admin UI and the public page can group
-- entries by season year instead of parsing it out of a title string.
--
-- No draft/published status, unlike articles (028): there's no "assign to a member, then publish"
-- step here -- the commissioner creates a row and it's immediately public, same shape as
-- teams/poll_weeks (002, 010). youtube_url/spotify_url are each individually optional (an entry
-- may be posted to one platform or both) but at least one must be set, or the entry would have
-- nothing to link to.

CREATE TABLE public.press_conferences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year    INTEGER NOT NULL,
  week_number    INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 30),
  title          TEXT NOT NULL,
  description    TEXT,
  youtube_url    TEXT,
  spotify_url    TEXT,
  -- Set only by the 050 backfill, to preserve each historical entry's existing local image
  -- rather than switching it to a derived YouTube thumbnail. The admin UI never writes this
  -- column -- new entries always derive their thumbnail client-side from youtube_url (or fall
  -- back to the site logo for a Spotify-only entry). See docs note in the PR description for why
  -- this app doesn't yet support a commissioner-uploaded thumbnail.
  thumbnail_url  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (youtube_url IS NOT NULL OR spotify_url IS NOT NULL)
);

CREATE INDEX idx_press_conferences_season_week
  ON public.press_conferences (season_year DESC, week_number DESC);

-- Reuses the trigger function 028 created for articles/article_matchups.
CREATE TRIGGER press_conferences_set_updated_at
  BEFORE UPDATE ON public.press_conferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.press_conferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view press conferences"
  ON public.press_conferences FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage press conferences"
  ON public.press_conferences FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'))
  WITH CHECK (public.jwt_has_role('commissioner'));
