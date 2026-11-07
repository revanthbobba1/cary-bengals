-- Article bylines: derive articles.author_slug from articles.author_id.
--
-- The public article page shows the author's name and headshot by matching author_slug against
-- data/members.ts. Nothing in the app ever wrote author_slug (only the 029 backfill did), while
-- assigning an author in the admin UI writes only author_id -- so every article created after the
-- backfill rendered with no author.
--
-- Fix: record each Supabase user's members.ts slug once (member_slugs), and let a trigger copy it
-- onto the article whenever author_id is set or changed. No extra step when assigning an author.
--
-- member_slugs has RLS enabled with no policies: it is only read by the SECURITY DEFINER trigger
-- below, never through PostgREST. To add a new league member, insert one row here (user's id ->
-- their members.ts slug) via the SQL editor; don't commit their email.

CREATE TABLE member_slugs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug    TEXT NOT NULL UNIQUE
);

ALTER TABLE member_slugs ENABLE ROW LEVEL SECURITY;

-- Seed from the current users, matched by their full_name profile field (the same public names as
-- data/members.ts -- emails are deliberately NOT written here: this repo is public).
-- Thanujeet Nanugonda is 'tj' in members.ts.
INSERT INTO member_slugs (user_id, slug)
SELECT u.id, m.slug
FROM (VALUES
  ('Amogh Natu',           'amogh'),
  ('Ankith Kodali',        'ankith'),
  ('Alvin Bao',            'alvin'),
  ('Thanujeet Nanugonda',  'tj'),
  ('Carter Bilbro',        'carter'),
  ('Joseph Hong',          'joseph'),
  ('Keshav Sridhar',       'keshav'),
  ('Kirk Broadbelt',       'kirk'),
  ('Revanth Bobba',        'revanth'),
  ('Rishi Nookala',        'rishi'),
  ('Sam Nangali',          'sam'),
  ('Sparsh Patel',         'sparsh')
) AS m(full_name, slug)
JOIN auth.users u ON u.raw_user_meta_data->>'full_name' = m.full_name
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_article_author_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only re-derive when the author actually changes (or on insert without an explicit slug), so
  -- unrelated edits never clobber a slug that was set by hand.
  IF TG_OP = 'INSERT' AND NEW.author_slug IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.author_id IS NOT DISTINCT FROM OLD.author_id THEN
    RETURN NEW;
  END IF;

  NEW.author_slug := (SELECT ms.slug FROM public.member_slugs ms WHERE ms.user_id = NEW.author_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER articles_set_author_slug
  BEFORE INSERT OR UPDATE OF author_id ON articles
  FOR EACH ROW EXECUTE FUNCTION public.set_article_author_slug();

-- Backfill articles that already have an author assigned but no slug.
UPDATE articles a
SET author_slug = ms.slug
FROM member_slugs ms
WHERE a.author_id = ms.user_id AND a.author_slug IS NULL;
