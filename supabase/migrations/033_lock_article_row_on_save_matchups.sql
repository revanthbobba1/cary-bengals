-- Previews & recaps, phase 3b — see docs/PREVIEWS_RECAPS_PLAN.md.
--
-- CREATE OR REPLACE on save_article_matchups (032) closing a TOCTOU gap: the ownership/draft
-- check went through article_is_own_draft(), a plain (non-locking) SELECT EXISTS, so nothing
-- stopped a concurrent publish_article() from committing between that check and this function's
-- DELETE+INSERT. A save that read "still a draft" could land its matchup edits on an
-- already-published article, bypassing publish_article()'s own completeness validation entirely.
-- Same class of bug 023 fixed for submit_poll_ballot; same fix -- SELECT ... FOR UPDATE to lock
-- the row for the duration of the transaction, inlining the check article_is_own_draft() can't
-- express while holding a lock (a plain SQL function's SELECT can't take FOR UPDATE the way this
-- plpgsql block can).
CREATE OR REPLACE FUNCTION public.save_article_matchups(
  p_article_id UUID,
  p_matchups JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_article public.articles;
BEGIN
  SELECT * INTO v_article FROM public.articles WHERE id = p_article_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article not found';
  END IF;

  IF NOT public.jwt_has_role('commissioner') THEN
    IF auth.uid() IS NULL
       OR v_article.author_id IS DISTINCT FROM auth.uid()
       OR v_article.status != 'draft' THEN
      RAISE EXCEPTION 'This article is not an editable draft assigned to you';
    END IF;
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
