-- Nothing previously set is_locked automatically — it was purely a manual
-- commissioner action. That mattered less before, but the public poll page
-- (015/016 era work, see docs/POLL_SYSTEM_PLAN.md) now gates entirely on
-- is_locked = true: if the commissioner forgets to click Lock after a
-- deadline passes, results never go public even though voting has genuinely
-- closed. This closes that gap with a scheduled job instead of relying on a
-- person remembering.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: cron.schedule() replaces any existing job with the same name,
-- so this is safe if this migration's SQL ever needs to run again.
SELECT cron.schedule(
  'auto-lock-expired-poll-weeks',
  '*/5 * * * *',
  $$UPDATE poll_weeks SET is_locked = true WHERE is_locked = false AND deadline <= now()$$
);
