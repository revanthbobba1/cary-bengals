-- Remove the unique constraint on final_rank to allow ties
ALTER TABLE poll_results DROP CONSTRAINT IF EXISTS poll_results_poll_week_id_final_rank_key;

-- Update the recalculate function to use RANK() for proper tie handling
CREATE OR REPLACE FUNCTION recalculate_poll_results(p_poll_week_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM poll_results WHERE poll_week_id = p_poll_week_id;

  INSERT INTO poll_results (poll_week_id, team_id, final_rank, avg_rank_score, team_record, trend, num_ballots)
  SELECT
    p_poll_week_id,
    team_id,
    RANK() OVER (ORDER BY avg_rank ASC) as final_rank,  -- Changed from ROW_NUMBER() to RANK()
    avg_rank as avg_rank_score,
    team_record,
    '-' as trend,
    num_ballots
  FROM (
    SELECT
      team_id,
      AVG(rank) as avg_rank,
      MODE() WITHIN GROUP (ORDER BY team_record) as team_record,
      COUNT(DISTINCT user_id) as num_ballots
    FROM poll_submissions
    WHERE poll_week_id = p_poll_week_id
    GROUP BY team_id
  ) aggregated;

  -- Calculate trends by comparing to previous week
  UPDATE poll_results pr
  SET trend = CASE
    WHEN prev_rank IS NULL THEN '-'
    WHEN prev_rank > pr.final_rank THEN '↑' || (prev_rank - pr.final_rank)::text
    WHEN prev_rank < pr.final_rank THEN '↓' || (pr.final_rank - prev_rank)::text
    ELSE '-'
  END
  FROM (
    SELECT
      pr2.team_id,
      pr2.final_rank as prev_rank
    FROM poll_results pr2
    JOIN poll_weeks pw2 ON pr2.poll_week_id = pw2.id
    WHERE pw2.season_year = (SELECT season_year FROM poll_weeks WHERE id = p_poll_week_id)
      AND pw2.week_number = (SELECT week_number - 1 FROM poll_weeks WHERE id = p_poll_week_id)
  ) previous
  WHERE pr.team_id = previous.team_id
    AND pr.poll_week_id = p_poll_week_id;
END;
$$ LANGUAGE plpgsql;
