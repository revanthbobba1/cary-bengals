# Migrations Index

Supabase migrations are an applied, sequential history — not disposable scripts. Production's
migration-history table already recorded all of these as applied, and later files are often
*deltas* against earlier ones (e.g. `DROP POLICY` + `CREATE POLICY` to redefine something), not
standalone snapshots. So they stay, in order, even where a later file supersedes an earlier one's
intent — deleting an "old" one can silently break what a fresh environment would end up with (see
`002` below for a concrete example). This file is just a map to make 14+ files navigable; it
changes nothing about how they run.

For current feature status and open issues, see `../../docs/POLL_SYSTEM_PLAN.md` (poll) and
`../../docs/PREVIEWS_RECAPS_PLAN.md` (previews & recaps).

## Testing RLS before merge

`010` shipped with a real RLS gap that went undetected for months because every manual test was
done as the commissioner, who bypasses RLS via a `FOR ALL` policy. `../tests/` holds
`BEGIN; ... ROLLBACK;`-wrapped scripts that exercise every other role too, by forging
`request.jwt.claims` rather than needing separate real accounts — see `../tests/verify_028.sql`
for the pattern to copy for any future migration that adds RLS policies.

## Schema

| File | What it does |
|---|---|
| `001_create_poll_tables.sql` | Core tables: `teams`, `poll_weeks`, `poll_submissions`, `poll_results` |
| `003_create_poll_functions.sql` | `recalculate_poll_results()` trigger function — auto-aggregates ballots into `poll_results`. The `FOR EACH ROW` trigger it originally shipped with is superseded by `016`. |
| `004_fix_tied_ranks.sql` | Drops the unique constraint on `final_rank`, switches `ROW_NUMBER()` → `RANK()` so tied teams share a rank (traditional sports ranking) |
| `016_statement_level_result_trigger.sql` | Replaces `003`'s `FOR EACH ROW` trigger with a `FOR EACH STATEMENT` one (transition tables + a per-week advisory lock) — fixes both the 24x-per-submit redundant recalculation and a real race where concurrent submissions could spuriously violate `poll_results`'s unique constraint. |

## Row-Level Security (iterative — each superseded the last for the policies it touches)

| File | What it does |
|---|---|
| `002_create_poll_rls.sql` | Enables RLS on all 4 tables and creates the public-read policies (`teams`/`poll_weeks`/`poll_results`). **Still load-bearing** — nothing later re-enables RLS or recreates these SELECT policies, so this file can't be removed even though its role-check policies were later replaced. |
| `007_fix_rls_policies.sql` | Replaces `002`'s role checks (which queried `auth.users` directly and hit "permission denied") with `auth.jwt()` claims instead. Adds a DELETE policy. |
| `008_simplify_rls_for_testing.sql` | Temporarily drops the role check from `poll_submissions` INSERT/DELETE while debugging the submission-persistence bug (see P0 in the plan doc). Superseded by `015`. |
| `010_add_commissioner_role.sql` | Introduces `jwt_has_role()` helper; moves week/team/result management and view-all-submissions from `admin`-gated to `commissioner`-gated. Also (unintentionally) dropped the only SELECT policy that let a *member* read their own submissions — see `015`. |
| `015_fix_submission_rls.sql` | Root-cause fix for the P0 bug: restores a member-readable SELECT policy on `poll_submissions`, and adds a shared `poll_week_is_open()` check so INSERT is gated the same way UPDATE/DELETE already were. This is the current active policy set. |

## Seed / one-time data

| File | What it does |
|---|---|
| `005_insert_2026_teams.sql` | Seeds the 12 team rows for the 2026 season |
| `006_create_week_1_poll.sql` | Creates the 2026 Week 1 poll week |
| `009_extend_week1_deadline.sql` | Extended the Week 1 deadline while testing submissions |

## Role model cleanup (2026-08-14)

| File | What it does |
|---|---|
| `011_fix_role_metadata_format.sql` | Root-cause fix: existing users had `role` (singular string) in `app_metadata`, but every RLS policy checks `roles` (array). Backfills `roles` for all users; grants the account owner `commissioner`. |
| `012_drop_legacy_role_field.sql` | Removes the now-redundant singular `role` field |
| `013_normalize_admin_role.sql` | Grants `admin` to every user (matches original design intent — all league members get equal `/admin` access) |
| `014_drop_member_role.sql` | Removes `member` entirely — it was never checked anywhere in the codebase; the role model is now `admin` (everyone) + `commissioner` (additive, poll administration) |

## Admin-facing features

| File | What it does |
|---|---|
| `017_submission_status_function.sql` | `get_poll_week_submission_status()` — `SECURITY DEFINER` function powering the "who has/hasn't submitted" view on `/admin`. Enforces its own `commissioner` check internally rather than relying on a service-role-key Route Handler, keeping the app free of that runtime secret. |
| `018_submission_status_full_name.sql` | Drops and recreates `017`'s function to also return `full_name`, so the submission-status list can show a real name instead of a raw email address, matching the fallback logic used for the page's own welcome message. |
| `019_auto_lock_expired_weeks.sql` | Enables `pg_cron` and schedules a job (every 5 min) that sets `is_locked = true` on any week whose deadline has passed. Previously `is_locked` was purely a manual commissioner action — that mattered less until the public poll page started gating entirely on it (see `docs/POLL_SYSTEM_PLAN.md`), at which point forgetting to click Lock meant results never went public even after voting genuinely closed. |
| `020_submit_poll_ballot.sql` | `submit_poll_ballot(p_poll_week_id, p_rankings)` — wraps the ballot delete-then-insert in one `SECURITY DEFINER` transaction, reusing `poll_week_is_open()` (015) for the same access check RLS already did. A failed insert now rolls back the delete instead of leaving the member with no ballot. |
| `021_require_submit_poll_ballot.sql` | Drops the member-only INSERT/UPDATE/DELETE policies on `poll_submissions` from `015`, closing a gap `020` left open: those policies still let any authenticated member write directly via PostgREST, bypassing the new atomic RPC entirely. RLS defaults to deny with no policy present, so this alone is enough to require every member write to go through `submit_poll_ballot`. Doesn't affect the commissioner's separate `FOR ALL` override policy (`010`) or the member SELECT policy (`015`). |
| `022_friendlier_closed_week_message.sql` | `CREATE OR REPLACE` on `submit_poll_ballot` (`020`) to raise the actionable "refresh the page" message directly, instead of a generic one the client had to pattern-match and override — one source of truth for the message instead of two copies that could drift. |
| `023_lock_poll_week_row_on_submit.sql` | `CREATE OR REPLACE` on `submit_poll_ballot` closing a TOCTOU gap: the open/closed check ran once via the non-locking `poll_week_is_open()`, then `DELETE`/`INSERT` ran unconditionally with no re-check and no RLS backstop (`SECURITY DEFINER`, and `021` dropped the member write policies). Now locks the `poll_weeks` row (`SELECT ... FOR UPDATE`) so a concurrent lock (auto-lock cron, `019`, or a manual lock) can't commit between the check and the writes. |

| `024_widen_rank_check_constraint.sql` | Relaxes the hardcoded `rank <= 12` CHECK to a generous static bound and moves the real "matches this season's team count" validation into `submit_poll_ballot` itself, so the roster can grow without a schema change. |
| `025_auto_grant_admin_role.sql` | `BEFORE INSERT` trigger on `auth.users` that grants every new signup `admin` automatically (promoting a legacy singular `role` string into the `roles` array first, if present) — closes the gap `011`/`013` left, where only users existing *at the time* were backfilled and every invite since had to be fixed by hand. Also backfills the one account that slipped through before the trigger existed. |
| `026_gate_admin_grant_on_invite.sql` | Adds a `WHEN (NEW.invited_at IS NOT NULL)` guard to `025`'s trigger, so it only fires for Dashboard-invited accounts, not any future self-service signup (e.g. if the Supabase project's "allow signups" setting were ever toggled on) — enforces the invite-only design intent at the database level instead of relying solely on that external setting. |
| `027_fix_recalculate_trigger_search_path.sql` | Root-cause fix for poll submissions failing outright: `submit_poll_ballot` (020) runs with `SET search_path = ''`, which stays in effect for the statement-level triggers (016) its own INSERT/DELETE fire. Neither `trigger_recalculate_poll_results()` nor `recalculate_poll_results()` (004) schema-qualified their references, so every unqualified name inside them failed to resolve under the inherited empty search_path (`42883`, surfaced to PostgREST as a 404) — every submission has been hitting this since `020` first shipped. Gives both functions their own `SET search_path = ''` and fully schema-qualifies every reference so they no longer depend on inherited search_path at all. |

## Previews & recaps

| File | What it does |
|---|---|
| `028_create_article_tables.sql` | Phase 0 of `../../docs/PREVIEWS_RECAPS_PLAN.md`: `articles` + `article_matchups`, replacing the flat MDX files in `data/newsfeed/`. Matchups are rows rather than a markdown blob because the content is already rigidly structured (5-6 matchup sections per article, identical shape across all 19 files) — that's what makes the scoreboard UI, season filtering, and eventual ESPN autofill possible. Ships **all** RLS for both tables in this one file, deliberately: `010` split the poll's policies across migrations and silently dropped members' SELECT for weeks. Writeups are assignment-gated — there is no `authenticated` INSERT policy at all, so only the commissioner (`FOR ALL`) can create an article, and an "assignment" is just an empty draft with `author_id` set. Also adds `assign_article()`, `publish_article()` (validates completeness + stamps `published_at` atomically, the same reasoning as `020`), `article_slug()`, and the first real `updated_at` trigger in this schema. |
| `029_backfill_articles.sql` | Phase 1: one-time seed of all 19 historical articles + 113 matchups, generated by `scripts/import-articles.mjs` from the original MDX files. Idempotent (`ON CONFLICT DO NOTHING`). |
| `030_normalize_article_slugs.sql` | Phase 2: switches `article_slug()` from spelled-out week numbers (`week-one-preview`) to digits (`week-1-preview`) and re-derives all 19 existing slugs to match, now that `/newsfeed` is being renamed to `/previews-recaps`. Reverses `028`'s original "match old MDX file paths" rationale — verified first that there are no live Giscus comment threads or GitHub Discussions to orphan. |

## Still outstanding

None currently tracked — see `docs/POLL_SYSTEM_PLAN.md` §6 for the remaining non-migration backlog
(ESPN API integration).
