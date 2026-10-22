---
name: season-rollover
description: Checklist for what needs updating in Cary Bengals Fantasy Football when a new NFL season starts (season config, ESPN team pairing, poll weeks). Use when the user asks to prepare for a new season, mentions a year rollover, or ESPN data stops syncing for no other explained reason.
user-invocable: true
---

# Season rollover checklist

Several things in this repo assume "the current season" and don't update
themselves when a new NFL season starts. This is the checklist for what
actually needs doing, split into confirmed vs. unverified, so this doesn't
need rediscovering from scratch each year.

## When to run this

When the user says it's time to start a new season, asks what needs
updating for the new year, or ESPN data (team names, rosters, records,
matchups) stops syncing with no other explained cause — that commonly means
step 1 below hasn't happened yet.

## 1. Bump the season config (required, code change)

`data/siteMetadata.js`'s `currentSeason` constant is the single value every
ESPN-touching code path keys off: both cron Route Handlers
(`app/api/espn/sync-all`, `app/api/espn/sync-matchups`), `/schedule`, and
`/league-members`. Nothing else in the ESPN pipeline infers the season any
other way. Bump it in a small PR, same workflow as any other change (feature
branch off `develop`, PR, review, merge) — not a value to edit directly on
`develop`.

This is **not** sourced from ESPN itself — it's a plain hardcoded number a
human has to remember to update. There is no automated detection of "the
season changed."

## 2. Pair the new season's ESPN teams (required, commissioner action, no code change)

`teams` rows are scoped per `season_year` (migration `034`) and do not carry
over automatically between seasons — last year's pairings have no effect on
the new year. A commissioner needs to run "Pair New Teams with ESPN" in the
commissioner panel (`components/EspnTeamSync.tsx`) for the new season before
any sync (rosters/records/matchups) has anything to write into. Nothing will
show up on `/schedule`, `/league-members`, or the poll until this happens.

## 3. Create the new season's first poll week (required, commissioner action, no code change)

Via the existing `PollWeekManager` UI (`components/PollWeekManager.tsx`).
Same action a commissioner already takes every week during the season —
nothing special about the first one of a new year, just flagging that
nothing happens automatically at the year boundary.

## 4. Watch for an ESPN "credentials expired" error around this time (verify, not confirmed-recurring)

The backend already has a clear failure path for this (`EspnAuthError` → 502
"credentials expired, re-capture cookies" — see
`docs/ESPN_INTEGRATION_PLAN.md` §2.6/§3), confirming ESPN's `espn_s2`/`SWID`
cookies do expire eventually. What's **not** confirmed is whether that
expiry is tied to the yearly season rollover specifically, versus just
"whenever ESPN invalidates the session" on its own unrelated schedule. If a
sync starts failing with this error around the start of a new season,
re-capture fresh cookies per `docs/ESPN_INTEGRATION_PLAN.md`'s Phase 0/§3
instructions and update the Render env vars by hand — `render.yaml` is not
actually wired up as the deploy source, see `.claude/CLAUDE.md`'s note on
this. Don't assume this needs doing every year until it's actually been
observed to recur that way.

## Explicitly NOT needed (so this list doesn't look incomplete by omission)

- GitHub Actions cron schedules (`.github/workflows/espn-matchup-sync.yml`,
  `espn-full-sync.yml`) are based on NFL day-of-week/time windows, not tied
  to a specific season — no change needed year to year.
- `matchups`, `team_rosters`, and `espn_schedule_state` are already scoped
  per `season_year` and purely additive — old seasons' rows just stop being
  read once `currentSeason` is bumped (step 1), no migration or cleanup
  needed.
- `/articles` and the poll's own history already have season filtering built
  into their UI (season pills) — old seasons remain browsable without any
  rollover action.
- Netlify/GitHub secrets (`ESPN_SYNC_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  the deployed Route Handler URLs) are season-independent — nothing to
  rotate here specifically for a rollover.
