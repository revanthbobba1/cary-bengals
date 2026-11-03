-- Phase 5 of docs/POLL_REMINDERS_PLAN.md: lets the commissioner switch reminders off per poll week.
--
-- Default true, so existing and newly created weeks keep sending unless someone turns them off. The
-- commissioner UI (components/PollWeekManager.tsx) also offers a bulk "all upcoming weeks" action
-- and defaults the create form to the latest week's setting, which is how "off" carries forward to
-- future weeks without a separate settings table.
--
-- poll_weeks is writable by the commissioner through the existing FOR ALL policy (010), so no new
-- policy is needed. Kept separate from 054 in case 054 has already been applied.

ALTER TABLE public.poll_weeks
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.poll_weeks.reminders_enabled IS
  'When false, the reminder job skips this week entirely (nothing is claimed or sent).';
