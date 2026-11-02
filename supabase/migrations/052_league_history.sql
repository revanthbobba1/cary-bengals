-- League History page (issue #194): read-only views that aggregate the backfilled matchups,
-- player scores and transactions by owner and season.
--
-- Why views, not client-side aggregation: Supabase's API returns at most 1000 rows per request
-- and silently drops the rest, and all-time stats need every matchup ever played. PostgREST
-- still lets the page `order`, `filter` and `limit` a view, so single-game records need no RPC.
--
-- Owners are grouped by `teams.espn_owner_id`, which is stable across seasons (team names are
-- not -- they change every year). Only paired teams (`espn_team_id IS NOT NULL`) are included,
-- which also leaves out the unpaired duplicate 2025 rows.
--
-- Only COMPLETED seasons are in `league_games` (and so in every view built on it): a season with
-- playoff matchups and no undecided non-bye game. The season in progress would otherwise show a
-- half-played record as if it were history.
--
-- Playoff placement (champion, runner-up, bracket) is deliberately NOT here: matchups carry no
-- winners-bracket vs consolation flag, so it is inferred from the bracket shape in
-- lib/history/bracket.ts.
--
-- `security_invoker` makes each view run with the caller's RLS, so these stay exactly as public
-- as the tables underneath (all public-read).

-- One row per team per played (non-bye) game, from that team's point of view.
CREATE VIEW public.league_games WITH (security_invoker = true) AS
WITH completed AS (
  SELECT season_year
  FROM public.matchups
  GROUP BY season_year
  HAVING bool_or(is_playoffs) AND NOT bool_or(NOT is_bye AND winner = 'UNDECIDED')
),
sides AS (
  SELECT m.id AS matchup_id, m.season_year, m.week_number, m.is_playoffs,
         m.home_team_id AS team_id, m.away_team_id AS opp_team_id,
         m.home_score AS pf, m.away_score AS pa,
         CASE m.winner WHEN 'HOME' THEN 'W' WHEN 'AWAY' THEN 'L' ELSE 'T' END AS result
  FROM public.matchups m
  JOIN completed c ON c.season_year = m.season_year
  WHERE NOT m.is_bye
  UNION ALL
  SELECT m.id, m.season_year, m.week_number, m.is_playoffs,
         m.away_team_id, m.home_team_id,
         m.away_score, m.home_score,
         CASE m.winner WHEN 'AWAY' THEN 'W' WHEN 'HOME' THEN 'L' ELSE 'T' END
  FROM public.matchups m
  JOIN completed c ON c.season_year = m.season_year
  WHERE NOT m.is_bye
)
SELECT s.matchup_id, s.season_year, s.week_number, s.is_playoffs,
       s.team_id, t.name AS team_name, t.owner_name, t.espn_owner_id AS owner_id,
       s.opp_team_id, o.name AS opp_team_name, o.owner_name AS opp_owner_name,
       o.espn_owner_id AS opp_owner_id,
       s.pf, s.pa, s.pf - s.pa AS margin, s.result
FROM sides s
JOIN public.teams t ON t.id = s.team_id
JOIN public.teams o ON o.id = s.opp_team_id
WHERE t.espn_team_id IS NOT NULL AND o.espn_team_id IS NOT NULL;

-- One row per team per completed season: regular-season record and points, the all-play record
-- (what the record would be had the team played every other team every week), and the ranks the
-- "luck" view compares. Standings are ordered by win % then points for; ESPN's own tiebreakers
-- (head-to-head first) are not stored, so a tied record can rank differently here than on ESPN.
CREATE VIEW public.league_team_seasons WITH (security_invoker = true) AS
WITH reg AS (
  SELECT * FROM public.league_games WHERE NOT is_playoffs
),
totals AS (
  SELECT team_id, season_year, owner_id, owner_name, team_name,
         count(*) FILTER (WHERE result = 'W') AS wins,
         count(*) FILTER (WHERE result = 'L') AS losses,
         count(*) FILTER (WHERE result = 'T') AS ties,
         sum(pf) AS points_for,
         sum(pa) AS points_against
  FROM reg
  GROUP BY team_id, season_year, owner_id, owner_name, team_name
),
all_play AS (
  SELECT a.team_id,
         count(*) FILTER (WHERE a.pf > b.pf) AS all_play_wins,
         count(*) FILTER (WHERE a.pf < b.pf) AS all_play_losses,
         count(*) FILTER (WHERE a.pf = b.pf) AS all_play_ties
  FROM reg a
  JOIN reg b ON b.season_year = a.season_year
            AND b.week_number = a.week_number
            AND b.team_id <> a.team_id
  GROUP BY a.team_id
)
SELECT t.team_id, t.season_year, t.owner_id, t.owner_name, t.team_name,
       t.wins, t.losses, t.ties, t.points_for, t.points_against,
       p.all_play_wins, p.all_play_losses, p.all_play_ties,
       rank() OVER (
         PARTITION BY t.season_year
         ORDER BY (t.wins + 0.5 * t.ties) / NULLIF(t.wins + t.losses + t.ties, 0) DESC,
                  t.points_for DESC
       ) AS standings_rank,
       rank() OVER (PARTITION BY t.season_year ORDER BY t.points_for DESC) AS points_for_rank
FROM totals t
JOIN all_play p ON p.team_id = t.team_id;

-- Regular-season totals per owner across every completed season. Titles and playoff appearances
-- are layered on in the app, from the inferred brackets.
CREATE VIEW public.league_owner_totals WITH (security_invoker = true) AS
SELECT owner_id,
       max(owner_name) AS owner_name,
       count(*) AS seasons,
       sum(wins) AS wins,
       sum(losses) AS losses,
       sum(ties) AS ties,
       sum(points_for) AS points_for,
       sum(points_against) AS points_against,
       min(standings_rank) AS best_rank,
       max(standings_rank) AS worst_rank
FROM public.league_team_seasons
GROUP BY owner_id;

-- Owner-vs-owner record over every game (regular season and playoffs).
CREATE VIEW public.league_h2h WITH (security_invoker = true) AS
SELECT owner_id, opp_owner_id,
       max(owner_name) AS owner_name,
       max(opp_owner_name) AS opp_owner_name,
       count(*) FILTER (WHERE result = 'W') AS wins,
       count(*) FILTER (WHERE result = 'L') AS losses,
       count(*) FILTER (WHERE result = 'T') AS ties,
       sum(pf) AS points_for,
       sum(pa) AS points_against
FROM public.league_games
WHERE owner_id <> opp_owner_id
GROUP BY owner_id, opp_owner_id;

-- Win and losing streaks per owner, across seasons and including playoffs (gaps-and-islands).
-- A tie ends a streak of either kind. `start_key`/`end_key` are season_year * 100 + week_number,
-- so they sort chronologically and decode with / and % 100.
CREATE VIEW public.league_streaks WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT owner_id, owner_name, season_year, week_number, result,
         row_number() OVER (PARTITION BY owner_id ORDER BY season_year, week_number) AS rn,
         row_number() OVER (PARTITION BY owner_id, result ORDER BY season_year, week_number) AS rn_result
  FROM public.league_games
)
SELECT owner_id,
       max(owner_name) AS owner_name,
       result,
       count(*) AS length,
       min(season_year * 100 + week_number) AS start_key,
       max(season_year * 100 + week_number) AS end_key
FROM ordered
WHERE result IN ('W', 'L')
GROUP BY owner_id, result, rn - rn_result;

-- Every player in every lineup with the owning team's identity, for best-single-game lists.
CREATE VIEW public.league_player_games WITH (security_invoker = true) AS
SELECT p.id, m.season_year, m.week_number, m.is_playoffs,
       p.player_name, p.position, p.pro_team, p.lineup_slot, p.is_starter, p.points,
       t.name AS team_name, t.owner_name, t.espn_owner_id AS owner_id
FROM public.matchup_player_scores p
JOIN public.matchups m ON m.id = p.matchup_id
JOIN public.teams t ON t.id = CASE p.team_side WHEN 'home' THEN m.home_team_id ELSE m.away_team_id END
WHERE t.espn_team_id IS NOT NULL;

-- Points scored by a team's bench players in one week (IR slots are listed separately by ESPN
-- and are not counted). That is the points a better lineup could have claimed, as an upper bound.
CREATE VIEW public.league_bench_weeks WITH (security_invoker = true) AS
SELECT m.season_year, m.week_number,
       t.name AS team_name, t.owner_name, t.espn_owner_id AS owner_id,
       sum(p.points) AS bench_points
FROM public.matchup_player_scores p
JOIN public.matchups m ON m.id = p.matchup_id
JOIN public.teams t ON t.id = CASE p.team_side WHEN 'home' THEN m.home_team_id ELSE m.away_team_id END
WHERE p.lineup_slot = 'Bench' AND t.espn_team_id IS NOT NULL
GROUP BY m.id, p.team_side, m.season_year, m.week_number, t.name, t.owner_name, t.espn_owner_id;

-- Transaction activity per owner. Trade counts are NOT complete for past seasons: ESPN returns
-- most past TRADE_ACCEPT entries empty, so the page must label them as a floor, not a total.
-- `claims_lost` is a bid ESPN failed because someone else got the player first; the other
-- FAILED_* reasons (roster limit, budget) are the owner's own doing and are not "lost".
CREATE VIEW public.league_owner_transactions WITH (security_invoker = true) AS
SELECT t.espn_owner_id AS owner_id,
       max(t.owner_name) AS owner_name,
       count(*) FILTER (WHERE x.kind = 'WAIVER') AS waiver_claims,
       count(*) FILTER (WHERE x.kind = 'WAIVER' AND x.status = 'EXECUTED') AS claims_won,
       count(*) FILTER (WHERE x.kind = 'WAIVER' AND x.status = 'FAILED_INVALIDPLAYERSOURCE') AS claims_lost,
       coalesce(sum(x.bid_amount) FILTER (WHERE x.kind = 'WAIVER' AND x.status = 'EXECUTED'), 0) AS faab_spent,
       count(*) FILTER (WHERE x.kind = 'FREEAGENT') AS free_agent_pickups,
       count(*) FILTER (WHERE x.kind = 'TRADE') AS trades
FROM public.transactions x
JOIN public.teams t ON t.season_year = x.season_year AND t.espn_team_id = x.espn_team_id
GROUP BY t.espn_owner_id;

GRANT SELECT ON
  public.league_games, public.league_team_seasons, public.league_owner_totals,
  public.league_h2h, public.league_streaks, public.league_player_games,
  public.league_bench_weeks, public.league_owner_transactions
TO anon, authenticated;
