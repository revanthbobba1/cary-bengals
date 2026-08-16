# Migrations Index

Supabase migrations are an applied, sequential history — not disposable scripts. Production's
migration-history table already recorded all of these as applied, and later files are often
*deltas* against earlier ones (e.g. `DROP POLICY` + `CREATE POLICY` to redefine something), not
standalone snapshots. So they stay, in order, even where a later file supersedes an earlier one's
intent — deleting an "old" one can silently break what a fresh environment would end up with (see
`002` below for a concrete example). This file is just a map to make 14+ files navigable; it
changes nothing about how they run.

For current feature status and open issues, see `../../docs/POLL_SYSTEM_PLAN.md`.

## Schema

| File | What it does |
|---|---|
| `001_create_poll_tables.sql` | Core tables: `teams`, `poll_weeks`, `poll_submissions`, `poll_results` |
| `003_create_poll_functions.sql` | `recalculate_poll_results()` trigger function — auto-aggregates ballots into `poll_results` |
| `004_fix_tied_ranks.sql` | Drops the unique constraint on `final_rank`, switches `ROW_NUMBER()` → `RANK()` so tied teams share a rank (traditional sports ranking) |

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

## Still outstanding

- Poll week lock/deadline UX and edge cases (reopen flow, deadline validation, public-page
  "newest week" selection, trigger efficiency) — see the P1 item in `docs/POLL_SYSTEM_PLAN.md` §3.
