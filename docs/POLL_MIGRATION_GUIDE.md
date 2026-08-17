# Commissioner Poll Migration Guide

This guide walks through deploying the new Supabase-based commissioner poll system.

> **Status:** this migration already happened for this project (data backfilled, teams/Week 1
> created). The guide is kept as a historical record of the steps taken; `scripts/migrate-poll-data.ts`
> and `scripts/run-sql.ts` referenced below have since been deleted as one-time tools no longer
> needed. For current feature status and open issues, see `POLL_SYSTEM_PLAN.md`.

## Overview

The commissioner poll system has been migrated from a flat file (`data/pollData.ts`) to a dynamic Supabase database. This enables:
- All 12 league members to submit weekly rankings
- Automatic aggregation of rankings
- Deadline management
- Submission tracking

## Prerequisites

- Supabase project with existing authentication setup
- Service role key for data migration (not needed for runtime)
- All environment variables configured:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (for migration only)

## Deployment Steps

### 1. Run Database Migrations

Apply the SQL migrations in your Supabase project (Dashboard → SQL Editor):

```bash
# In Supabase Dashboard SQL Editor, run in order:
1. supabase/migrations/001_create_poll_tables.sql
2. supabase/migrations/002_create_poll_rls.sql
3. supabase/migrations/003_create_poll_functions.sql
```

**Verify tables created:**
- `teams`
- `poll_weeks`
- `poll_submissions`
- `poll_results`

### 2. Migrate Historical Data

Run the migration script locally to backfill historical poll data:

```bash
# Set environment variable for service role key (not in .env file)
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run migration
yarn migrate:poll-data
```

**Expected output:**
```
Starting poll data migration...

Processing season 2025...
  ✓ Inserted 12 teams
  ✓ Migrated 2025 Week 1 (12 teams)
  ✓ Migrated 2025 Week 6 (12 teams)
  ✓ Migrated 2025 Week 7 (12 teams)
  ✓ Migrated 2025 Week 8 (12 teams)
  ✓ Migrated 2025 Week 9 (12 teams)
  ✓ Migrated 2025 Week 10 (12 teams)

Processing season 2024...
  ✓ Inserted 12 teams
  ✓ Migrated 2024 Week 1 (12 teams)
  ✓ Migrated 2024 Week 2 (12 teams)

✅ Migration complete!
```

**Verify in Supabase Dashboard:**
- `teams` table has entries for 2024 and 2025 seasons
- `poll_weeks` table has 8 weeks total (6 for 2025, 2 for 2024)
- `poll_results` table has aggregated rankings for each week

### 3. Create Teams for Current Season (2026)

You need to manually create team entries for the 2026 season. Two options:

**Option A: Via Supabase Dashboard (Table Editor)**

Navigate to `teams` table and insert 12 rows:
- `name`: Team name (e.g., "Code Monkey (PR #414) (Ankith)")
- `owner_name`: Owner name (e.g., "Ankith")
- `season_year`: `2026`

**Option B: Via SQL (faster)**

```sql
INSERT INTO teams (name, owner_name, season_year) VALUES
  ('Team Name 1 (Owner1)', 'Owner1', 2026),
  ('Team Name 2 (Owner2)', 'Owner2', 2026),
  -- ... (add all 12 teams)
  ('Team Name 12 (Owner12)', 'Owner12', 2026);
```

### 4. Create First Poll Week

Use the admin interface or SQL to create the first poll week:

**Via Admin UI:**
1. Deploy the code (step 5)
2. Log in as admin
3. Navigate to `/admin/poll/manage`
4. Create new poll week:
   - Season Year: `2026`
   - Week Number: `1`
   - Deadline: Set appropriate deadline (e.g., Tuesday 11:59 PM)

**Via SQL:**

```sql
INSERT INTO poll_weeks (season_year, week_number, deadline, is_locked)
VALUES (2026, 1, '2026-09-08 23:59:00+00', false);
```

### 5. Deploy Code

**Local Testing:**
```bash
yarn dev
# Visit http://localhost:3000
# Test poll display and admin submission
```

**Deploy to Netlify:**
```bash
git add .
git commit -m "Migrate commissioner poll to Supabase"
git push origin main
```

Netlify will auto-deploy on push to `main`.

### 6. Verify Deployment

**Public Poll Display:**
- Visit `/poll` (or wherever CommissionerPoll component is used)
- Should see historical data from 2024-2025
- Year/week dropdowns should work
- Data should load from Supabase

**Admin Dashboard:**
- Visit `/admin`
- Should see poll submission status if a week is open
- "Submitted" and "Not Submitted" lists should show users

**Submit Rankings:**
- Visit `/admin/poll`
- Should see form to rank all 12 teams
- Submit and verify it saves
- Edit and verify changes persist

**Poll Week Management:**
- Visit `/admin/poll/manage`
- Should see list of existing weeks
- Create a new week and verify it appears

## Testing Checklist

- [ ] Historical data visible on `/poll` page
- [ ] Year/week dropdowns work correctly
- [ ] Trends display properly for weeks with previous data
- [ ] Admin dashboard shows submission status
- [ ] Poll submission form loads teams correctly
- [ ] Can submit rankings
- [ ] Can edit rankings before deadline
- [ ] Cannot edit after deadline passes
- [ ] Poll results aggregate correctly with multiple submissions
- [ ] Submission counts match actual submissions

## Troubleshooting

### Migration Script Errors

**Error: "Missing required environment variables"**
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Service role key is different from anon key - get it from Supabase Dashboard → Settings → API

**Error: "duplicate key value violates unique constraint"**
- Migration script is idempotent - safe to re-run
- If you need to reset, delete data from tables in reverse order:
  1. `poll_results`
  2. `poll_submissions`
  3. `poll_weeks`
  4. `teams`

### RLS Errors

**Error: "new row violates row-level security policy"**
- Verify user has `admin` role in `app_metadata.roles` (the `member` role referenced in earlier
  versions of this guide was removed — see `supabase/migrations/README.md`)
- Check RLS policies are correctly applied
- Use Supabase Dashboard → Authentication → Users to verify user roles

### Data Not Showing

**Poll page shows "No poll data available"**
- Verify migration ran successfully
- Check `poll_weeks` and `poll_results` tables have data
- Check browser console for Supabase errors

**Admin dashboard shows no submission status**
- Verify there's an open poll week (not locked, deadline in future)
- Check `poll_weeks` table for `is_locked = false` entries

## Next Steps

1. **Create remaining poll weeks for 2026 season**
   - Use `/admin/poll/manage` to create weeks 2-17

2. **Invite league members to submit rankings**
   - All users (everyone has the `admin` role by default) can access `/admin/poll`

3. **Set up weekly reminders** (future enhancement)
   - Consider email notifications for members who haven't submitted

4. **Monitor first live poll**
   - Verify aggregation works correctly
   - Check that trends calculate properly for week 2+

## Files Modified/Created

### Database
- `supabase/migrations/001_create_poll_tables.sql`
- `supabase/migrations/002_create_poll_rls.sql`
- `supabase/migrations/003_create_poll_functions.sql`

### Scripts
- `scripts/migrate-poll-data.ts`
- `package.json` (added `migrate:poll-data` script)

### Types
- `lib/types/poll.ts`

### Components
- `components/CommissionerPoll.tsx` (Server Component wrapper)
- `components/CommissionerPollClient.tsx` (Client Component with UI)
- `components/PollSubmissionForm.tsx`
- `components/PollWeekManager.tsx`

### Pages
- `app/admin/page.tsx` (updated with submission status)
- `app/admin/poll/page.tsx`
- `app/admin/poll/manage/page.tsx`

### Dependencies
- Added: `tsx` (dev dependency)

## Support

For issues or questions:
- Check Supabase Dashboard logs (Dashboard → Logs)
- Review browser console for client-side errors
- Check server logs in Netlify (Deploys → [build] → Function logs)
