-- Previews & recaps, phase 2 — see docs/PREVIEWS_RECAPS_PLAN.md.
--
-- Switches article_slug() from spelled-out week numbers ('week-one-preview') to digits
-- ('week-1-preview'), reversing 028's original rationale ("word-numbers... so new URLs then look
-- like old ones"). That rationale assumed there was something live worth matching: verified during
-- phase 2 planning (2026-09-07) that there are zero GitHub Discussions on this repo and no Giscus
-- env vars configured anywhere, so no comment thread has ever existed to orphan. Digits are simpler
-- and there's nothing live to preserve by keeping the spelled-out form.
CREATE OR REPLACE FUNCTION public.article_slug(
  p_season_year INTEGER,
  p_week_number INTEGER,
  p_kind article_kind
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN p_season_year || '/week-' || p_week_number || '-' || p_kind::text;
END;
$$;

-- Re-derive all 19 backfilled slugs in one statement. Safe against the UNIQUE (slug) constraint:
-- old slugs are word-based and new ones are digit-based, so there is no overlap between any old
-- value and any new value, and therefore no transient collision mid-statement.
--
-- 028's articles_enforce_assignment_fields trigger blocks slug changes unless jwt_has_role()
-- reports the caller as commissioner -- which it never does here, since a migration runs with no
-- JWT at all. That check exists to stop an app-level author edit from sneaking in a slug change;
-- it isn't meant to constrain a schema migration, so it's disabled for this one statement only.
ALTER TABLE public.articles DISABLE TRIGGER articles_enforce_assignment_fields;

UPDATE public.articles
SET slug = public.article_slug(season_year, week_number, kind);

ALTER TABLE public.articles ENABLE TRIGGER articles_enforce_assignment_fields;
