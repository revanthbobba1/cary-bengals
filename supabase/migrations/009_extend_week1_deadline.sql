-- Extend Week 1 deadline to give time for testing
UPDATE poll_weeks
SET deadline = '2026-08-15 23:59:00+00'
WHERE season_year = 2026 AND week_number = 1;
