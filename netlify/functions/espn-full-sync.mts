// Netlify-scheduled replacement for the cron in .github/workflows/espn-full-sync.yml -- the
// waiver-driven daily refresh. GitHub's scheduler started that run ~4.5 hours late, so it moved
// here with the matchup sync. See netlify/lib/espnCron.ts.

import { callSyncRoute, easternTime } from '../lib/espnCron'

// Fires at :00 and :30; the 8am ET hour (Tue-Fri) therefore gets two attempts. The second is a
// retry for a cold-backend failure on the first, and a harmless idempotent re-sync otherwise.
export const config = { schedule: '0,30 * * * *' }

const SYNC_DAYS = ['Tue', 'Wed', 'Thu', 'Fri']
const SYNC_HOUR_ET = 8

export default async function handler() {
  const { weekday, hour } = easternTime(new Date())
  if (!SYNC_DAYS.includes(weekday) || hour !== SYNC_HOUR_ET) {
    console.log('Not the daily full-sync hour; skipping.')
    return
  }
  await callSyncRoute('/api/espn/sync-all')
}
