-- Weekly awards (issue #234): the stored winner of each award for each finished week.
--
-- Why stored, not computed on read: the bench/player-of-the-week awards need every box-score row
-- for every week, ~3,400 rows per season (~20,000 across 2019-2025), far past PostgREST's
-- 1000-rows-per-request cap. The award rules live in lib/awards/weeklyAwards.ts (a pure function);
-- lib/awards/awardSync.ts runs them once when a week finishes and stores only the winners, so an
-- owner's trophy case reads a few hundred small rows via `league_owner_awards`.
--
-- One row per (season, week, award): an award has a single winner a week. `award_id` is the
-- AwardId union in lib/awards/weeklyAwards.ts (not a CHECK constraint, so adding an award there
-- needs no migration).
--
-- Same RLS shape as `matchups` (042): public read, commissioner write. The scheduled cron sync
-- uses the service role, which bypasses RLS.

CREATE TABLE public.award_results (
  season_year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  award_id TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_year, week_number, award_id)
);

CREATE INDEX idx_award_results_team ON public.award_results(team_id);

ALTER TABLE public.award_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view award results"
  ON public.award_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage award results"
  ON public.award_results FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'))
  WITH CHECK (public.jwt_has_role('commissioner'));

-- Award wins per owner (grouped by `teams.espn_owner_id`, stable across seasons -- see 052), for
-- the trophy case. Only paired teams count, matching the other league_* views.
CREATE VIEW public.league_owner_awards WITH (security_invoker = true) AS
SELECT t.espn_owner_id AS owner_id,
       a.award_id,
       count(*)::integer AS wins
FROM public.award_results a
JOIN public.teams t ON t.id = a.team_id
WHERE t.espn_team_id IS NOT NULL
GROUP BY t.espn_owner_id, a.award_id;
