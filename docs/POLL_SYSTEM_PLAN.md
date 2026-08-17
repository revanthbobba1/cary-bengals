# Commissioner Poll System — Consolidated Plan & Status

Living document for the Supabase-backed commissioner poll feature. Supersedes the original
planning doc (`~/.claude/plans/woolly-knitting-curry.md`, local-only, not in the repo) as the
source of truth for where this feature stands. See `POLL_MIGRATION_GUIDE.md` for step-by-step
deployment instructions and `supabase/migrations/README.md` for an index of what each migration
file does — this doc is about scope, status, and roadmap.

Last reviewed: 2026-08-16

## 1. Goal

Replace the flat-file poll (`data/pollData.ts`) with a Supabase-backed system where all 12
league members submit weekly power-ranking ballots through an admin UI, rankings are
auto-aggregated (average rank, ties handled the traditional sports way — e.g. 3, 3, 5), and
historical 2024–2025 data is preserved.

## 2. Status vs. Original Plan

The original plan (database schema, RLS, types, components) was implemented essentially as
designed, with the deviations below — mostly driven by things that surfaced during build/test.

| Area | Plan | Actual | Note |
|---|---|---|---|
| Schema (`teams`, `poll_weeks`, `poll_submissions`, `poll_results`) | 1 migration (`001`) | Same, unchanged | ✅ matches |
| Tie handling | Not addressed in original schema (`UNIQUE(poll_week_id, final_rank)`, `ROW_NUMBER()`) | Fixed in `004_fix_tied_ranks.sql`: dropped the unique constraint on `final_rank`, switched `ROW_NUMBER()` → `RANK()` | ✅ intentional change per your requirement (traditional sports ranking: ties share a rank, next rank skips) |
| RLS policies | Role-gated via `raw_app_meta_data->roles` query against `auth.users` (`002`) | Rewritten repeatedly: `002` (query `auth.users`, hits "permission denied") → `007` (use `auth.jwt()` claims) → `008` (drops the role check entirely, testing shim) → `010` (commissioner-only SELECT, member SELECT accidentally dropped) → `015` (member SELECT restored; INSERT/UPDATE/DELETE all gated on a shared `poll_week_is_open()` check instead of role) | ✅ resolved — see P0 in §3 |
| Team record on ballot | User-entered free-text field per team | Changed to **read-only display context**: pulled from the *previous* week's `poll_results.team_record`, shown next to each team, not submitted by the user | ✅ your call — a team's W-L record shouldn't influence how it's ranked |
| Admin dashboard (`app/admin/page.tsx`) | Lists **all** members' submission status via `supabase.auth.admin.listUsers()` | `auth.admin.listUsers()` requires the **service role key**, which isn't available in a server component using the anon key — so this was simplified to show only the **current user's own** submission status | ⚠️ **gap vs. original intent**: there is currently no admin-facing view of who on the league has/hasn't submitted. Needs a proper solution (see Backlog) |
| Deadline formatting | `toLocaleString()` | `app/admin/page.tsx` uses a custom `formatDeadline()` (to fix a hydration mismatch); `app/admin/poll/page.tsx` still uses `toLocaleString()` directly | Low risk (server-only render), but worth double-checking if the hydration warning ever resurfaces on the poll page |
| Debug tooling | Not in original plan | `app/api/debug-poll/route.ts` — GET endpoint dumping poll weeks/submissions/user IDs, **no auth check** | ⚠️ **must be removed or auth-gated before deploying to production** |
| 2026 teams / Week 1 setup | Via admin UI or SQL | Done via SQL migrations `005` (teams) and `006`/`009` (Week 1, deadline extended for testing) | ✅ fine for bootstrapping; future weeks should go through the `PollWeekManager` UI as intended |

## 3. Known Issues (Backlog)

### ✅ P0 — Submissions not persisting (RESOLVED 2026-08-16)
Root cause found via a full RLS/state-space audit, and it was never actually about inserts
failing. **There was no SELECT policy letting a member read their own submissions.** Migration
`010` (commissioner role) dropped the old admin-gated SELECT policy on `poll_submissions` and
replaced it with a *commissioner-only* one — so every insert since then had been succeeding,
but every non-commissioner member's read of their own ballot (including `/api/debug-poll` and
the "have I submitted" check on `/admin`) was silently filtered by RLS. It only ever looked
fine during testing because the account used is the commissioner, which bypasses this via the
`FOR ALL` "Commissioner can manage all submissions" policy.

Fixed in `supabase/migrations/015_fix_submission_rls.sql`:
- Added `"Users can view own submissions"` — a plain `user_id = auth.uid()` SELECT policy.
- Closed a second, related gap: the INSERT policy never checked `poll_weeks.is_locked`/`deadline`
  (unlike UPDATE/DELETE), so a late/locked submission was only ever prevented by the page UI
  hiding the form, not by the database. A shared `poll_week_is_open()` predicate now backs
  INSERT/UPDATE/DELETE consistently.

Also fixed in `components/PollSubmissionForm.tsx`: the ranking form used to render *only* the
teams present in `existingSubmission`, so a partial prior submission silently showed fewer than
12 rows with no way to recover the rest. It now always renders all teams, seeded from the saved
order where available. The delete-then-insert submit flow also used to swallow a blocked delete
as a non-fatal warning and proceed to insert anyway, which could 409 against the unique
constraint if the week closed between page load and submit (this is where the historical 409
symptom came from); it now detects a zero-row delete when rows were expected and surfaces a
clear "this week closed while you were ranking" message instead.

The 2026-08-14 role/roles metadata fix (`011`/`012`) was a real bug and remains fixed, but it
was not the cause of this symptom — it just happened to be found first.

**Superseded backlog item:** the old plan to "restore the admin role check" on INSERT/DELETE
(previously listed as P1 below) is intentionally *not* done. After `013`/`014`, `admin` is
granted to every user and checked nowhere else, so gating INSERT on it again would add no real
access control while creating a silent-403 footgun for the next hand-invited member. The actual
gap was always the week-open check, which `015` now provides.

### 🟡 P1 — Poll week lock/deadline UX and edge cases
A follow-up audit of the full `is_locked` × deadline × submission-state space (beyond the P0 fix
above) found several smaller, real issues, not yet fixed:
- Reopening a week that's both locked *and* past deadline requires two separate edits (unlock,
  then extend deadline) with no UI indication both are needed — no single "Reopen" action.
- `PollWeekManager.tsx` doesn't validate that a new/edited deadline is actually in the future,
  and doesn't check the result of its Supabase updates for a silently-blocked (0-row) RLS denial.
- The public `/poll` page picks the *newest* week by number regardless of whether it has
  published results, so creating the next week's poll can blank or prematurely expose an
  in-progress week's live results.
- The per-row result-recalculation trigger runs the full aggregation query 12 times per submit
  instead of once, which can spuriously fail under concurrent submissions near a deadline.
- Two simultaneously "open" weeks (e.g. next week staged early) silently resolve to whichever
  has the nearer deadline, with no indication to the commissioner which one members are
  actually seeing.

Full state-space table and proposed fixes (additional migration + `PollWeekManager.tsx`/public
page changes) available on request — not yet written to a file.

### 🟡 P1 — No admin visibility into league-wide submission status
`auth.admin.listUsers()` can't run with the anon key. To restore the "who has/hasn't
submitted" dashboard view, need either:
- A Route Handler using the service role key (server-only, never exposed to the client), or
- A `submission_status` view/table joined against `auth.users` via a `SECURITY DEFINER` Postgres function

### 🟡 P1 — Debug endpoint is unauthenticated
`/api/debug-poll` exposes user IDs and submission data to anyone. Remove before production, or
at minimum gate it behind the admin auth check used elsewhere.

## 4. Completed ✅ (this update: commissioner role)

- [x] **Commissioner role** — `supabase/migrations/010_add_commissioner_role.sql` introduces a
  `commissioner` role distinct from `admin`/`member`. Poll week / team / poll result management
  and viewing-all-submissions RLS policies now require `commissioner` instead of `admin`.
  Commissioner can also override/delete any member's submission (for correcting bad ballots).
  `lib/supabase/roles.ts` adds a shared `isCommissioner()`/`hasRole()` helper; `/admin/poll/manage`
  and the "Manage Poll Weeks" links on `/admin` are gated on it.

  **Status: done.** Migrations `010`–`012` are live on production. The account owner's
  `app_metadata.roles` is now `["admin", "commissioner"]` (the legacy singular `role` field was
  also cleaned up — see the P0 section above for why that existed). Future invited members who
  need commissioner access will need the same manual step: Supabase Dashboard → Authentication
  → Users → select user → Edit → App Metadata → add `"commissioner"` to their `roles` array.
  Remember to sign out/in after changing your own roles — RLS reads the JWT, not a live DB
  lookup, so an existing session won't see the change until the token refreshes.

  **2026-08-14 follow-up:** found that some already-invited members (e.g. Ankith) had `member`
  instead of `admin` in `raw_app_meta_data` — a manual invite-time inconsistency, not something
  any code in this repo controls (there's no invite UI; roles are hand-entered per user in the
  Supabase Dashboard). Per the original plan's stated intent ("all 12 league members have admin
  role") and since admin/member have always been functionally identical, `013_normalize_admin_role.sql`
  additively grants `admin` to every existing user. Any pre-existing `member` tag was left in
  place (harmless) rather than stripped.

  **2026-08-14, later same day:** `member` removed entirely — `014_drop_member_role.sql` strips
  it from every user's `roles` array, `lib/supabase/roles.ts`'s `Role` type is now just
  `'admin' | 'commissioner'`, and `CLAUDE.md` updated accordingly. The role model going forward
  is two-tier: `admin` (baseline `/admin` access, granted to everyone) and `commissioner`
  (additive, poll administration only).

### Completed ✅ (prior)

- [x] Schema + indexes for `teams`, `poll_weeks`, `poll_submissions`, `poll_results`
- [x] RLS enabled on all poll tables (see caveat above — role check currently relaxed)
- [x] Trigger-based auto-aggregation (`recalculate_poll_results`) on submission insert/update/delete
- [x] Tied-rank handling (traditional sports ranking)
- [x] Historical 2024–2025 data migrated (ties preserved) — the one-time script that did this
  (`scripts/migrate-poll-data.ts`) and the ad hoc `scripts/run-sql.ts` debug helper have since
  been deleted along with the `migrate:poll-data` package.json script and unused `tsx` dev
  dependency, now that their one-time job is done
- [x] 2026 teams seeded, Week 1 poll created
- [x] Public poll display (`CommissionerPoll.tsx` → `CommissionerPollClient.tsx`) reading from Supabase
- [x] Admin ballot submission form (`PollSubmissionForm.tsx`) with previous-week record/rank shown as context
- [x] Poll week management UI (`PollWeekManager.tsx`) for creating weeks / adjusting deadlines
- [x] Supabase CLI linked, migration history repaired, `supabase/migrations/*.sql` as source of truth going forward

## 5. Backlog / Stretch Goals

From the original plan's "Future Enhancements," re-triaged against what's safe to build before
the P0 submission bug is fixed vs. what depends on real submission data existing.

**Safe to build now** (don't require live submissions):
1. **ESPN API integration** — pull live team names/records/owners from the league's ESPN
   Fantasy Football API instead of manual entry. Needs: league ID, whether the league is
   public or private (private requires `espn_s2` + `SWID` cookies).
2. **Mobile-optimized ranking UI** — drag-and-drop reordering instead of per-row dropdowns.

**Blocked until P0 is fixed** (need real submission rows to build/verify against):
3. **Detailed ballot breakdowns** — page showing each member's individual ranking, not just the aggregate.
4. **Email reminders** — notify members who haven't submitted before deadline.
5. **Historical trends chart** — visualize a team's rank across the season.
6. **Voting power/weights** — give specific members more weight in the aggregate.

## 6. Next Session Priorities

1. Verify the P0 fix end-to-end from a **non-commissioner** account (the bug it fixes is
   invisible from the commissioner account — see §3).
2. Poll week lock/deadline UX and edge cases (P1, §3) — reopen flow, deadline validation,
   public-page "newest week" selection, trigger efficiency.
3. Decide on and implement the admin submission-status view (P1, §3).
4. Continue ESPN API integration per `docs/ESPN_INTEGRATION_PLAN.md` — Phase 0 (public/private
   league, league ID, cookies) still needs the user's input before implementation starts.
