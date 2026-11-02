// Netlify-scheduled waiver-driven daily refresh. It used to run as a GitHub Actions cron, but
// GitHub's scheduler started it ~4.5 hours late. See netlify/lib/espnCron.ts.

import { callSyncRoute, easternTime } from '../lib/espnCron'

// Fires at :00 and :30; the 8am ET hour (every day) therefore gets two attempts. The second is a
// retry for a cold-backend failure on the first, and a harmless idempotent re-sync otherwise.
export const config = { schedule: '0,30 * * * *' }

// Every day, not just the mornings after waiver runs: free-agent pickups and trades happen any
// day, and this league's waivers also process on weekends and Mondays (waiverProcessDays), so a
// Tue-Fri schedule left the Transactions page up to several days behind.
const SYNC_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SYNC_HOUR_ET = 8

export default async function handler() {
  const { weekday, hour } = easternTime(new Date())
  if (!SYNC_DAYS.includes(weekday) || hour !== SYNC_HOUR_ET) {
    console.log('Not the daily full-sync hour; skipping.')
    return
  }
  await callSyncRoute('/api/espn/sync-all')
}
