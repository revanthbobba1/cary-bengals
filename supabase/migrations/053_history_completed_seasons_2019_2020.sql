-- League History: count 2019 and 2020 as completed seasons.
--
-- Those two seasons were backfilled from ESPN (10 teams) and only had two playoff weeks, so the
-- "three playoff weeks" rule from 052 would leave them out of every history view. Seasons from
-- 2021 on keep the original rule: it exists to hold back a season whose later playoff rounds
-- have not been added yet, and 2019-2020 are finished history that will never gain more rounds.
-- This supersedes the rule described in 052's header. The 2021 cutoff is mirrored by
-- SINGLE_WEEK_PLAYOFFS_FROM in lib/history/recordsData.ts: those playoff rounds were two-week
-- matchups, so their scores are left out of single-game records.

CREATE OR REPLACE VIEW public.league_completed_seasons WITH (security_invoker = true) AS
SELECT season_year
FROM public.matchups
GROUP BY season_year
HAVING count(DISTINCT week_number) FILTER (WHERE is_playoffs)
         >= CASE WHEN season_year < 2021 THEN 2 ELSE 3 END
   AND NOT bool_or(NOT is_bye AND winner = 'UNDECIDED');
