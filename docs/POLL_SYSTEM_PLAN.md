# Commissioner Poll System — Consolidated Plan & Status

Living document for the Supabase-backed commissioner poll feature. Supersedes the original
planning doc (`~/.claude/plans/woolly-knitting-curry.md`, local-only, not in the repo) as the
source of truth for where this feature stands. See `POLL_MIGRATION_GUIDE.md` for step-by-step
deployment instructions and `supabase/migrations/README.md` for an index of what each migration
file does — this doc is about scope, status, and roadmap.

Last reviewed: 2026-09-02

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
| Admin dashboard (`app/admin/page.tsx`) | Lists **all** members' submission status via `supabase.auth.admin.listUsers()` | `auth.admin.listUsers()` requires the **service role key**, not available with the anon key — solved instead with a `SECURITY DEFINER` Postgres function (`017_submission_status_function.sql`) callable via the normal client | ✅ resolved — see P1 in §3 |
| Deadline formatting | `toLocaleString()` | `app/admin/page.tsx` uses a custom `formatDeadline()` (to fix a hydration mismatch); `app/admin/poll/page.tsx` still uses `toLocaleString()` directly | Low risk (server-only render), but worth double-checking if the hydration warning ever resurfaces on the poll page |
| Debug tooling | Not in original plan | `app/api/debug-poll/route.ts` — GET endpoint dumping poll weeks/submissions/user IDs, **no auth check** | ✅ removed once direct `psql` access was set up — see §4 |
| 2026 teams / Week 1 setup | Via admin UI or SQL | Done via SQL migrations `005` (teams) and `006`/`009` (Week 1, deadline extended for testing) | ✅ fine for bootstrapping; future weeks should go through the `PollWeekManager` UI as intended |

## 3. Known Issues (Backlog)

### ✅ P0 — Submissions not persisting (fix applied 2026-08-16, verified live 2026-09-02)
**Fully closed out.** A second league member logged in and confirmed, from a genuine
non-commissioner account: `/admin` and `/admin/poll` show correct real submission status, the
Commissioner section correctly does not appear (role gating working as intended — that account
has `admin` only, not `commissioner`), submitting rankings persists via `submit_poll_ballot`, and
editing an existing ballot works. This was the last gating item for the poll feature.

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

### ✅ P1 — Poll week lock/deadline UX and edge cases (RESOLVED 2026-08-17)
A follow-up audit of the full `is_locked` × deadline × submission-state space (beyond the P0 fix
above) found several smaller, real issues. Fixed:
- **Reopen action** — a week that's both locked *and* past deadline now has a single "Reopen"
  button (prompts for a new deadline, unlocks and extends in one update) instead of requiring two
  separate edits with no indication both were needed.
- **Deadline validation** — creating a week blocks a non-future deadline outright; editing an
  existing deadline into the past asks for confirmation instead (closing early is legitimate,
  just worth confirming). `PollWeekManager.tsx`'s updates now also check the row count returned,
  not just `error` — RLS silently no-ops a blocked update rather than raising an error.
- **Public page week selection** — `CommissionerPoll.tsx` now defaults to the newest week that
  actually has published results, not just the newest week that exists, so staging next week's
  poll early no longer blanks the public page.
- **Trigger efficiency/correctness** — `016_statement_level_result_trigger.sql` replaces the
  `FOR EACH ROW` trigger (which ran the full aggregation 24 times per 12-team submit) with a
  `FOR EACH STATEMENT` trigger using transition tables plus a per-week advisory lock, fixing both
  the redundant work and the real race where concurrent submissions near a deadline could
  spuriously 23505 against `poll_results`'s unique constraint.
- **Multiple open weeks** — `PollWeekManager.tsx` now shows a warning banner naming every
  currently-open week and which one members are actually seeing (nearest deadline wins, matching
  the app's own query logic), rather than silently resolving with no visibility.

**✅ Resolved 2026-08-19:** the submit flow now goes through `submit_poll_ballot`
(`020_submit_poll_ballot.sql`), a `SECURITY DEFINER` function wrapping the delete-then-insert in
one transaction — reuses `poll_week_is_open()` for the same access check RLS already enforced,
so a failed insert (bad data, dropped connection, constraint violation) now rolls back the delete
too instead of leaving the member with no ballot. `PollSubmissionForm.tsx` calls it via a single
`supabase.rpc()` call instead of two round-trips; the now-unreachable RLS-denial (`42501`) branch
in `describeSubmissionError` was removed since this RPC bypasses RLS by design and surfaces a
closed-week error via its own `RAISE EXCEPTION` message instead. The now-unused `userId` prop
threaded through `PollSubmissionForm.tsx` was also removed — the RPC identifies the caller via
`auth.uid()` server-side, never a client-supplied id.

**Caught by review before merge:** `020` alone didn't actually make the atomicity guarantee
airtight — it left the member-only INSERT/UPDATE/DELETE policies from `015` in place, so a
direct PostgREST call (bypassing the app's own code entirely) could still do the old two-step
write. `021_require_submit_poll_ballot.sql` drops those three policies; RLS defaults to deny with
no policy present, so this alone requires every member write to go through the RPC. Verified live
against production (`pg_policies` on `poll_submissions` now shows only the member SELECT policy
and the commissioner's SELECT/`FOR ALL` policies — no member-only write policy remains).

The first fix for the "closed week" message match (022's predecessor) had the client string-match
the RPC's exact exception text and swap in a friendlier one — fragile, and two copies of the same
message that could silently drift. `022_friendlier_closed_week_message.sql` raises the friendlier
message directly from the function instead, so `describeSubmissionError` is back to a plain
pass-through of `err.message` with one source of truth for the copy.

**Caught by a second review before merge — TOCTOU gap.** `submit_poll_ballot` checked
`poll_week_is_open()` once, then ran `DELETE`/`INSERT` unconditionally with no re-check at write
time. Under READ COMMITTED, a concurrent lock (the auto-lock cron, `019`, or a manual lock)
committing between the check and the writes would still let the ballot write land — and since
`021` dropped RLS's member write policies, nothing backstopped this at the database layer either.
Narrower than the old two-round-trip client flow's equivalent window, so not a strict regression,
but not airtight. `023_lock_poll_week_row_on_submit.sql` fixes it by locking the `poll_weeks` row
(`SELECT ... FOR UPDATE`) instead of calling the non-locking `poll_week_is_open()` helper for this
one check — a concurrent lock/unlock on the same row now blocks against this transaction instead
of racing it. Verified live: the closed-week branch correctly raises against a real locked week.

**2026-08-17 follow-up — public page gating landed on `is_locked` alone.** This went through a
few iterations (any-week-with-results → closed-or-deadline-passed → locked-only) before settling
on the current state: `CommissionerPoll.tsx` shows only weeks with `is_locked = true`, per
explicit direction — locking is the deliberate "these results are final" signal, independent of
how many of the ~12 members actually voted. The dropdown is gated the same way; previously it had
no filter at all and could list a week with zero submissions.

This made a second gap matter that didn't before: **nothing set `is_locked` automatically** — it
was purely a manual commissioner action. Now that public visibility depends entirely on it,
forgetting to click Lock after a deadline passes meant results never went public. Fixed in
`019_auto_lock_expired_weeks.sql` — a `pg_cron` job locks any week whose deadline has passed,
every 5 minutes. `PollWeekManager.tsx`'s plain "Unlock" button is now hidden for a week that's
both locked and past-deadline (only "Reopen," which sets a new deadline in the same action, is
offered there) — otherwise a plain unlock would just get auto-locked again within minutes.

**✅ Resolved 2026-08-19 — timezone hydration mismatch.** `formatDeadline` used local-timezone
`Date` methods (`getHours()`, `getMonth()`, etc.), so server (Netlify, UTC) and client (the
viewer's own zone) could render different text for the same instant. Rather than deferring to
client-only rendering (which would've meant a blank/placeholder flash on load), the fix removes
the dependency on either machine's local clock entirely: deadlines are always shown in a fixed
league timezone (`America/New_York`, per your explicit call — Cary Bengals is Cary, NC-based, and
a shared deadline should read the same for every viewer rather than each person seeing their own
converted local time). Deduplicated the two copies of `formatDeadline` (`app/admin/page.tsx`,
`PollWeekManager.tsx`) into `lib/formatDeadline.ts`, using `Intl.DateTimeFormat` with an explicit
`timeZone` so DST (EST/EDT) is handled automatically; also fixed `app/admin/poll/page.tsx`, which
had been silently showing the Netlify server's own zone (UTC) via a bare `toLocaleString()`, not
any meaningfully "local" time. `toDatetimeLocal` (feeds native `<input type="datetime-local">`)
is deliberately untouched — that control is always interpreted in the *browser's* local zone, so
switching it to a fixed zone would break the round-trip back to an ISO timestamp on save.

### ✅ P1 — No admin visibility into league-wide submission status (RESOLVED 2026-08-17)
`auth.admin.listUsers()` can't run with the anon key, so this couldn't be built the way the
original plan assumed. Went with the `SECURITY DEFINER` Postgres function option rather than a
service-role-key Route Handler — it avoids introducing a permanent service-role secret into the
running app (previously only ever used for the one-time data migration script) and matches the
`jwt_has_role()`/`poll_week_is_open()` pattern already established here of pushing access control
into Postgres.

`get_poll_week_submission_status(p_poll_week_id)` (`017_submission_status_function.sql`) enforces
its own `commissioner` check internally (raises if not a commissioner — verified this actually
rejects a non-commissioner-context call), joins `auth.users` (filtered to accounts with the
`admin` role, i.e. league members) against `poll_submissions` for the given week, and computes
`has_submitted` against the season's actual team count rather than a hardcoded 12. Wired into
`app/admin/page.tsx` as a commissioner-only list below the existing Poll section, only rendered
when a week is open.

### Known, accepted edge cases (not fixed — documented per the 99%-not-99.99% standard)

- **Commissioner's `FOR ALL` override policy bypasses `submit_poll_ballot`'s team-count check.**
  `submit_poll_ballot` (`024`) validates rankings match the season's actual team count, but the
  commissioner's `"Commissioner can manage all submissions"` policy (`010`, `FOR ALL`, no
  `WITH CHECK`) still lets a raw PostgREST call insert a `poll_submissions` row with any rank up
  to the schema's generic bound, skipping that check. Only exploitable by the commissioner
  themselves via a hand-crafted API call (not through the app UI), and the worst outcome is
  self-inflicted bad data they'd have to deliberately construct and could just as easily fix by
  resubmitting. Flagged in PR #46's review (2026-09-02); not worth the structural cost of a
  table-level constraint or trigger to close a gap only the trusted commissioner can even reach.

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
- [x] RLS enabled on all poll tables, including a member-readable SELECT policy and a shared
  week-open check on INSERT/UPDATE/DELETE (see P0 above — `015`)
- [x] Trigger-based auto-aggregation (`recalculate_poll_results`) on submission insert/update/delete
- [x] Tied-rank handling (traditional sports ranking)
- [x] Historical 2024–2025 data migrated (ties preserved) — the one-time script that did this
  (`scripts/migrate-poll-data.ts`) and the ad hoc `scripts/run-sql.ts` debug helper have since
  been deleted along with the `migrate:poll-data` package.json script and unused `tsx` dev
  dependency, now that their one-time job is done
- [x] 2026 teams seeded, Week 1 poll created
- [x] Public poll display (`CommissionerPoll.tsx` → `CommissionerPollClient.tsx`) reading from Supabase
- [x] Admin ballot submission form (`PollSubmissionForm.tsx`), drag-and-drop ranking (Framer Motion,
  with a keyboard fallback), previous-week record/rank shown as context
- [x] Poll week management UI (`PollWeekManager.tsx`) for creating weeks, editing deadlines, and
  locking/unlocking submissions
- [x] Persistent in-app navigation (`AdminSubNav`) across `/admin`, `/admin/poll`, and
  `/admin/poll/manage` — no reliance on browser back/forward
- [x] Unauthenticated `/api/debug-poll` endpoint removed (had already served its purpose once
  direct `psql` access via the Supabase CLI was set up)
- [x] Supabase CLI linked, migration history repaired, `supabase/migrations/*.sql` as source of truth going forward

## 5. Backlog / Stretch Goals

From the original plan's "Future Enhancements," re-triaged against what's safe to build before
the P0 submission bug is fixed vs. what depends on real submission data existing.

**Safe to build now** (don't require live submissions):
1. **ESPN API integration** — pull live team names/records/owners from the league's ESPN
   Fantasy Football API instead of manual entry. Design complete, see
   `docs/ESPN_INTEGRATION_PLAN.md`; Phase 0 needs the user's input (league ID, public/private).
2. ~~Mobile-optimized ranking UI~~ — done, see §4 (drag-and-drop via Framer Motion).

**Now unblocked** (non-commissioner verification passed 2026-09-02 — real members can submit,
safe to build on top of that data):
3. **Detailed ballot breakdowns** — page showing each member's individual ranking, not just the aggregate.
4. **Email reminders** — notify members who haven't submitted before deadline.
5. **Historical trends chart** — visualize a team's rank across the season.
6. **Voting power/weights** — give specific members more weight in the aggregate.

## 6. Next Session Priorities

1. ~~Gating item — verify the P0 fix end-to-end from a non-commissioner account~~ — done
   2026-09-02, see the resolved note in §3.
2. ~~Optional: `submit_poll_ballot` RPC~~ — done, see the resolved note under the poll week UX
   item in §3.
3. ~~Optional: fix the `formatDeadline`/`toDatetimeLocal` timezone-dependent hydration mismatch~~
   — done, see the 2026-08-19 resolved note in §3.
4. Continue ESPN API integration per `docs/ESPN_INTEGRATION_PLAN.md` — Phase 0 (public/private
   league, league ID, cookies) still needs the user's input before implementation starts.
