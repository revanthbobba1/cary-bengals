# Poll Expiration Reminders — Plan

Living document for GitHub issue #131: emailing league voters shortly before a poll week's
deadline. See `POLL_SYSTEM_PLAN.md` for the poll feature this builds on and
`ESPN_INTEGRATION_PLAN.md` for the Netlify-cron pattern it reuses.

Last reviewed: 2026-11-02
Status: **planned, not started**

## 1. Goal

Email voters who have not yet submitted their ballot a reminder N hours (default 4) before a
poll week's `deadline`. Email only, via Gmail SMTP (free; see 3.1). The sender lives behind one small helper so a
different channel could be swapped in later, but no pluggable-channel abstraction is built now.

## 2. Findings that shaped the design

- **Recipients are Supabase auth users with the `admin` role**, not `data/members.ts` entries.
  `get_poll_week_submission_status` (migration 018) already lists them with email and
  `has_submitted`. `auth.users.email` is the single source of truth; `members.ts` is not involved.
- That function requires a commissioner JWT, so a cron cannot call it. A service-role-only variant
  is needed (Phase 1) rather than loosening the existing one.
- `has_submitted` means submission count >= team count for the season (one `poll_submissions`
  row per team per voter), not merely "has any row".
- `poll_weeks.deadline` is a `TIMESTAMPTZ`; `is_locked` marks a closed week. Migration 009
  extended a deadline after the fact, so deadline edits are a real case.
- The ESPN syncs set the pattern: a Netlify scheduled function only decides whether to run, then
  POSTs to an `/api/...` Route Handler that checks `x-cron-secret` (`lib/espn/cronAuth.ts`) and
  uses `createServiceRoleClient()` (`lib/supabase/serviceRole.ts`). Logic stays in the Route
  Handler.

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                             | Status                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 3.1 | Email only, via Gmail SMTP using `nodemailer` and an app password. Resend was dropped 2026-11-02: it needs a purchased domain to email anyone but the account owner, which violates the free-only rule (AGENTS.md "Cost constraint") | Decided                    |
| 3.2 | Remind only members who have not submitted                                                                                                                                                                                           | Decided                    |
| 3.3 | Lead time configurable per poll week, default 4 hours                                                                                                                                                                                | Decided                    |
| 3.4 | Idempotency via atomic claim of `reminder_sent_at`                                                                                                                                                                                   | Decided                    |
| 3.5 | Changing `deadline` clears `reminder_sent_at` (re-arms)                                                                                                                                                                              | Decided                    |
| 3.6 | Partial send failures: log, no per-recipient retry or `poll_reminders` table (proportionate; see "99% usable")                                                                                                                       | Recommended, unconfirmed   |
| 3.7 | Single reminder only; no "final hour" second nudge                                                                                                                                                                                   | Recommended, unconfirmed   |
| 3.8 | Phases 1-4 ship together as one PR if small; Phase 5 UI is a follow-up                                                                                                                                                               | Recommended, unconfirmed   |
| 3.9 | Sending account: a Gmail account for the league itself, not a personal address. User is checking whether one already exists and getting its credentials                                                                              | **Open — waiting on user** |

## 4. Phases

Phase N+1 does not start until phase N's PR is merged and its migration applied.

### Phase 1: schema — `supabase/migrations/054_poll_reminders.sql`

- `poll_weeks`: add `reminder_hours_before integer NOT NULL DEFAULT 4` and
  `reminder_sent_at timestamptz NULL`.
- Trigger: when `deadline` changes, set `reminder_sent_at = NULL`.
- Service-role-only SQL function `get_unsubmitted_voters(p_poll_week_id uuid)` returning
  `user_id, email, full_name` for admin-role users whose submission count is below the season's
  team count. Revoke from `authenticated`; grant to `service_role` only.
- **Before writing:** list existing triggers on `poll_weeks` and `auth.users`. Migrations 036/037
  were caused by an undocumented trigger the earlier migrations never mentioned.

### Phase 2: email helper — `lib/email/sendEmail.ts`

- Add the `nodemailer` npm package (plus `@types/nodemailer`). Server-only; uses
  `smtp.gmail.com` on port 465 (TLS) and reads `GMAIL_USER` and `GMAIL_APP_PASSWORD`. The From
  address is `GMAIL_USER`. Gmail rewrites any other From address, so there is no separate var.
- Netlify Next.js route handlers run on Node, so `nodemailer` works there. Confirm the route is
  not on the Edge runtime.
- `sendPollReminder({ to, weekNumber, deadline, pollUrl })`.
- Render the deadline in ET (check whether `lib/formatDeadline.ts` supports an explicit time zone).
- Short plain body linking to `/admin/poll`.
- No CSP change: sending is server-side.

### Phase 3: reminder route — `app/api/polls/send-reminders/route.ts`

1. `verifyCronSecret`, else 401.
2. Select weeks with `is_locked = false`, `reminder_sent_at IS NULL`, `deadline > now()`, and
   `deadline - now() <= reminder_hours_before` hours.
3. Claim each week atomically:
   `UPDATE poll_weeks SET reminder_sent_at = now() WHERE id = $1 AND reminder_sent_at IS NULL RETURNING id`.
   No row returned means another run won; skip.
4. Fetch unsubmitted voters, send one email each, collect per-recipient failures without aborting.
   Return `{ weeks, sent, failed }`.
5. If every send fails, clear `reminder_sent_at` so the next run retries. If only some fail, leave
   it set and log them (decision 3.6).

### Phase 4: scheduler — `netlify/functions/poll-reminders.mts`

- `export const config = { schedule: '*/15 * * * *' }`.
- No time-window gating; reminders can be due at any hour and the claim flag makes frequent runs cheap.
- Reuse `callSyncRoute` from `netlify/lib/espnCron.ts`, making its ESPN `/healthz` warm-up
  optional, or rename the helper to something neutral.

### Phase 5: commissioner control (optional, separate PR)

- In `/admin/commissioner`'s poll-week form: editable "Remind N hours before" and a read-only
  "Reminder sent at ..." line. Phase 1's default of 4 means this only adds editing.

## 5. Setup outside the code

- Use the league's Gmail account (3.9). Turn on 2-Step Verification, then create an **app
  password** at myaccount.google.com/apppasswords. Normal passwords do not work over SMTP.
- Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` to Netlify env vars and `.env.example` (blank values
  only; never commit real ones). Keep both server-only.
- Gmail's limit is about 500 messages a day, far above a league's needs. Reminders from a
  personal-style address may land in spam at first; ask members to mark the first one "not spam".
- Risk to watch: if the account's password changes or 2-Step Verification is turned off, Google
  revokes app passwords and sends fail silently from the cron's point of view. The route should
  log send errors clearly.
- Document the new route in `lib/openapi/spec.ts` if the other cron routes are listed there.

## 6. Verification

No JS test framework, so Phase 3 is verified manually against a dev Supabase project:

- Set a week's deadline ~3 hours out; call the route twice. Expect one email, then nothing.
- A voter who already submitted gets no email.
- A locked week is skipped.
- Editing the deadline re-arms the reminder.
- Run `yarn lint` and `yarn build` before each PR. PRs target `develop`; close #131 by hand
  (`gh issue close 131 --comment "Merged in #<PR>"`) after merging, with `Closes #131` in the body.

## 7. Open questions / follow-ups

- League Gmail account and app password (3.9). Phases 1-3 can be built and tested before this
  arrives by logging emails instead of sending them.
- Whether to add a "final hour" second reminder (3.7).
- Whether voters can ever lack an email in `auth.users` (invited accounts should always have one;
  confirm, and decide whether to surface skipped voters to the commissioner).

## 8. Log

- 2026-11-02: plan drafted from issue #131 and a read of the poll schema, 018 status function,
  and Netlify cron helpers. Nothing implemented.
