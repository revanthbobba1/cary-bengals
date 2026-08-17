-- Create Week 1 poll for 2026 season
INSERT INTO poll_weeks (season_year, week_number, deadline, is_locked)
VALUES (2026, 1, '2026-08-09 23:59:00+00', false)
ON CONFLICT (season_year, week_number) DO NOTHING;
