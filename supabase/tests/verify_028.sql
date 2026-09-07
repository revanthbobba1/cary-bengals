-- Verification for migration 028 (articles schema, RLS, RPCs).
-- Run after applying 028, e.g.:
--   supabase db query --linked --file supabase/tests/verify_028.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project. Confirmed
-- clean (all 9 checks pass, zero leftover rows) against production on 2026-09-06.
--
-- The SQL editor and `db query --linked` both connect as `postgres`, which BYPASSES RLS. Every
-- test below therefore uses `SET LOCAL ROLE authenticated` (or anon) plus a forged
-- `request.jwt.claims` to exercise the exact same code path jwt_has_role() reads in production
-- (see migration 010). No second Supabase account is needed -- only one real auth.users row, for
-- the author_id FK.
--
-- This is the pattern to copy for verifying future RLS-bearing migrations before merge: 010's
-- postmortem is that testing only as the commissioner (who bypasses RLS via a FOR ALL policy)
-- hid a real bug for months. Forged claims make every other role just as easy to test as that one.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $fixtures$
DECLARE
  v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'FAIL: no auth.users row exists -- need at least one real user for author_id FK';
  END IF;
  PERFORM set_config('test.author_id', v_user::text, true);
  RAISE NOTICE 'fixtures: using real user % as author_id', v_user;
END
$fixtures$;

-- Seed one published article+matchup and one draft article+matchup as postgres (bypasses RLS),
-- so the read-side tests below have something to see or not-see.
DO $seed$
DECLARE
  v_author uuid := current_setting('test.author_id')::uuid;
  v_published_id uuid;
  v_draft_id uuid;
BEGIN
  INSERT INTO articles (season_year, week_number, kind, slug, title, status, author_id, published_at)
  VALUES (1999, 1, 'preview', '1999/week-one-preview', 'Published Fixture', 'published', v_author, now())
  RETURNING id INTO v_published_id;

  INSERT INTO article_matchups (article_id, position, away_team_name, home_team_name, body)
  VALUES (v_published_id, 1, 'Away Fixture', 'Home Fixture', 'fixture body');

  INSERT INTO articles (season_year, week_number, kind, slug, title, status, author_id)
  VALUES (1999, 2, 'preview', '1999/week-two-preview', 'Draft Fixture', 'draft', v_author)
  RETURNING id INTO v_draft_id;

  INSERT INTO article_matchups (article_id, position, away_team_name, home_team_name, body)
  VALUES (v_draft_id, 1, 'Away Draft', 'Home Draft', '');

  PERFORM set_config('test.published_id', v_published_id::text, true);
  PERFORM set_config('test.draft_id', v_draft_id::text, true);
  RAISE NOTICE 'fixtures: published=% draft=%', v_published_id, v_draft_id;
END
$seed$;

-- ---------------------------------------------------------------------------
-- Test 1: anon sees published, not drafts
-- ---------------------------------------------------------------------------

DO $anon_read$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_count FROM articles WHERE id = current_setting('test.published_id')::uuid;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: anon cannot see published article';
  END IF;

  SELECT count(*) INTO v_count FROM articles WHERE id = current_setting('test.draft_id')::uuid;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'FAIL: anon CAN see a draft article -- RLS leak';
  END IF;

  SELECT count(*) INTO v_count FROM article_matchups WHERE article_id = current_setting('test.published_id')::uuid;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: anon cannot see published article matchups';
  END IF;

  SELECT count(*) INTO v_count FROM article_matchups WHERE article_id = current_setting('test.draft_id')::uuid;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'FAIL: anon CAN see draft matchups -- RLS leak';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: anon sees published only, on both tables';
END
$anon_read$;

-- ---------------------------------------------------------------------------
-- Test 2: plain admin cannot INSERT an article (the assignment gate)
-- ---------------------------------------------------------------------------

DO $admin_insert$
DECLARE v_other uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO articles (season_year, week_number, kind, slug, title, status)
    VALUES (1999, 3, 'preview', '1999/week-three-preview', 'Should not exist', 'draft');
    RAISE EXCEPTION 'FAIL: a plain admin CREATED an article -- assignment gate is open';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: plain admin INSERT refused (assignment gate holds)';
  END;

  EXECUTE 'RESET ROLE';
END
$admin_insert$;

-- ---------------------------------------------------------------------------
-- Test 3: plain admin can't read someone else's draft
-- ---------------------------------------------------------------------------

DO $admin_read_draft$
DECLARE
  v_other uuid := gen_random_uuid();
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM articles WHERE id = current_setting('test.draft_id')::uuid;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'FAIL: plain admin CAN see another member''s draft -- RLS leak';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: plain admin cannot read others'' drafts';
END
$admin_read_draft$;

-- ---------------------------------------------------------------------------
-- Test 4: plain admin cannot call assign_article()
-- ---------------------------------------------------------------------------

DO $admin_assign$
DECLARE
  v_other uuid := gen_random_uuid();
  v_author uuid := current_setting('test.author_id')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.assign_article(1999, 4, 'preview', v_author);
    RAISE EXCEPTION 'FAIL: plain admin was able to assign_article()';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'Commissioner access required%' THEN
        RAISE NOTICE 'PASS: plain admin assign_article() refused (%)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'FAIL: assign_article() raised unexpected error: %', SQLERRM;
      END IF;
  END;

  EXECUTE 'RESET ROLE';
END
$admin_assign$;

-- ---------------------------------------------------------------------------
-- Test 5: assigned author sees + edits own draft, can't self-publish via UPDATE
-- ---------------------------------------------------------------------------

DO $author_edit$
DECLARE
  v_author uuid := current_setting('test.author_id')::uuid;
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_author,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM articles WHERE id = current_setting('test.draft_id')::uuid;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: assigned author cannot see own draft';
  END IF;

  UPDATE articles SET title = 'Edited by author' WHERE id = current_setting('test.draft_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: assigned author could not edit own draft title';
  END IF;

  BEGIN
    UPDATE articles SET status = 'published' WHERE id = current_setting('test.draft_id')::uuid;
    RAISE EXCEPTION 'FAIL: author was able to self-publish via direct UPDATE -- must go through publish_article()';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: author cannot set status=published directly';
  END;

  EXECUTE 'RESET ROLE';
END
$author_edit$;

-- ---------------------------------------------------------------------------
-- Test 6: publish_article() rejects an article with zero matchups
-- ---------------------------------------------------------------------------

DO $publish_empty$
DECLARE
  v_author uuid := current_setting('test.author_id')::uuid;
  v_empty_id uuid;
BEGIN
  -- Seed as postgres (RLS bypass) so this test isolates publish_article()'s own validation,
  -- not the INSERT policy already covered by test 2.
  EXECUTE 'RESET ROLE';
  INSERT INTO articles (season_year, week_number, kind, slug, title, status, author_id)
  VALUES (1999, 5, 'preview', '1999/week-five-preview', 'Empty Fixture', 'draft', v_author)
  RETURNING id INTO v_empty_id;
  PERFORM set_config('test.empty_id', v_empty_id::text, true);

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_author,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.publish_article(v_empty_id);
    RAISE EXCEPTION 'FAIL: publish_article() published an article with zero matchups';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'Add at least one matchup%' THEN
        RAISE NOTICE 'PASS: publish_article() rejects zero-matchup article (%)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'FAIL: publish_article() raised unexpected error: %', SQLERRM;
      END IF;
  END;

  EXECUTE 'RESET ROLE';
END
$publish_empty$;

-- ---------------------------------------------------------------------------
-- Test 7: publish_article() happy path stamps published_at
-- ---------------------------------------------------------------------------

DO $publish_happy$
DECLARE
  v_author uuid := current_setting('test.author_id')::uuid;
  v_status article_status;
  v_published_at timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_author,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- draft_id's matchup already has body='' (test-6-adjacent fixture); give it content first, since
  -- publish_article() also enforces every matchup has a non-empty body.
  UPDATE article_matchups SET body = 'now has a writeup' WHERE article_id = current_setting('test.draft_id')::uuid;

  PERFORM public.publish_article(current_setting('test.draft_id')::uuid);

  SELECT status, published_at INTO v_status, v_published_at
  FROM articles WHERE id = current_setting('test.draft_id')::uuid;

  IF v_status != 'published' THEN
    RAISE EXCEPTION 'FAIL: publish_article() happy path did not flip status to published';
  END IF;
  IF v_published_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: publish_article() happy path left published_at NULL';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: publish_article() happy path published_at=%', v_published_at;
END
$publish_happy$;

-- ---------------------------------------------------------------------------
-- Test 8: commissioner can assign; duplicate assignment refused
-- ---------------------------------------------------------------------------

DO $commissioner_assign$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_author uuid := current_setting('test.author_id')::uuid;
  v_new_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin', 'commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_new_id := public.assign_article(1999, 6, 'preview', v_author);
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: commissioner assign_article() did not return an id';
  END IF;
  RAISE NOTICE 'PASS: commissioner assigned article %', v_new_id;

  BEGIN
    PERFORM public.assign_article(1999, 6, 'preview', v_author);
    RAISE EXCEPTION 'FAIL: duplicate assignment for the same season/week/kind succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'That week already has a%' THEN
        RAISE NOTICE 'PASS: duplicate assignment refused (%)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'FAIL: duplicate assignment raised unexpected error: %', SQLERRM;
      END IF;
  END;

  EXECUTE 'RESET ROLE';
END
$commissioner_assign$;

-- ---------------------------------------------------------------------------
-- Test 9: RLS is actually enabled on both tables
-- ---------------------------------------------------------------------------

DO $rls_enabled$
DECLARE
  v_articles_rls boolean;
  v_matchups_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_articles_rls FROM pg_class WHERE relname = 'articles';
  SELECT relrowsecurity INTO v_matchups_rls FROM pg_class WHERE relname = 'article_matchups';

  IF NOT v_articles_rls THEN
    RAISE EXCEPTION 'FAIL: RLS not enabled on articles';
  END IF;
  IF NOT v_matchups_rls THEN
    RAISE EXCEPTION 'FAIL: RLS not enabled on article_matchups';
  END IF;

  RAISE NOTICE 'PASS: RLS enabled on both articles and article_matchups';
END
$rls_enabled$;

ROLLBACK;
