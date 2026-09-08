-- Previews & recaps, phase 3b — see docs/PREVIEWS_RECAPS_PLAN.md.
--
-- The editor needs to add/remove/reorder/edit matchups as one "Save" action. article_matchups has
-- UNIQUE (article_id, position), not deferrable, so per-row bare updates would hit transient
-- collisions on any reorder (e.g. swapping positions 1 and 2 -- whichever row is updated first
-- collides with the row still sitting at its target position). submit_poll_ballot (020) solved the
-- identical class of problem for poll rankings by deleting and re-inserting the whole list in one
-- transaction instead of diffing individual rows; this does the same for matchups.
CREATE OR REPLACE FUNCTION public.save_article_matchups(
  p_article_id UUID,
  p_matchups JSONB  -- ordered array; each element is one matchup's editable fields
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- SECURITY DEFINER bypasses RLS, so article_is_own_draft()'s check (the same predicate every
  -- article_matchups write policy already relies on) is re-checked explicitly here, same reasoning
  -- as assign_article/publish_article.
  IF NOT public.article_is_own_draft(p_article_id) AND NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'This article is not an editable draft assigned to you';
  END IF;

  DELETE FROM public.article_matchups WHERE article_id = p_article_id;

  INSERT INTO public.article_matchups (
    article_id, position, slot_label, away_team_name, home_team_name,
    away_team_id, home_team_id, away_record, home_record, line, away_score, home_score, body
  )
  SELECT
    p_article_id,
    ordinality,
    m->>'slot_label',
    m->>'away_team_name',
    m->>'home_team_name',
    (m->>'away_team_id')::uuid,
    (m->>'home_team_id')::uuid,
    m->>'away_record',
    m->>'home_record',
    m->>'line',
    (m->>'away_score')::numeric,
    (m->>'home_score')::numeric,
    m->>'body'
  FROM jsonb_array_elements(p_matchups) WITH ORDINALITY AS t(m, ordinality);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_article_matchups(uuid, jsonb) TO authenticated;
