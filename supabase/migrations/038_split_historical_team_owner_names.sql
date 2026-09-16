-- Keep the historical owner display separate from the team name.
--
-- Older seed data stored values such as "Code Monkey (PR #414) (Ankith)" in
-- teams.name while owner_name already contained "Ankith". Only remove an
-- exact trailing owner suffix; team IDs and all poll foreign keys stay intact.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teams AS t
    WHERE t.name LIKE '% (' || t.owner_name || ')'
      AND EXISTS (
        SELECT 1
        FROM public.teams AS candidate
        WHERE candidate.season_year = t.season_year
          AND candidate.name = left(t.name, length(t.name) - length(' (' || t.owner_name || ')'))
          AND candidate.id <> t.id
      )
  ) THEN
    RAISE EXCEPTION 'Historical team-name cleanup would create a duplicate team name';
  END IF;

  UPDATE public.teams AS t
  SET name = left(t.name, length(t.name) - length(' (' || t.owner_name || ')')),
      updated_at = now()
  WHERE t.name LIKE '% (' || t.owner_name || ')';
END;
$$;
