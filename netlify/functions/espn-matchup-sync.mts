// Netlify-scheduled replacement for the cron in .github/workflows/espn-matchup-sync.yml. GitHub's
// `schedule` trigger is best-effort and was observed running ~2 times in a window that should
// have had ~36 runs; Netlify's scheduler fires on time. See netlify/lib/espnCron.ts.

import { callSyncRoute, easternTime } from '../lib/espnCron'

export const config = { schedule: '*/10 * * * *' }

// [weekday, startHour, endHourExclusive] in ET. A window that crosses midnight is two entries
// (the evening part on its own weekday, the spillover on the next one).
const LIVE_WINDOWS: Array<[string, number, number]> = [
  ['Thu', 20, 24], // Thursday Night Football, 8pm...
  ['Fri', 0, 1], // ...through 12:59am
  ['Sun', 13, 24], // Sunday afternoon games from 1pm, through Sunday Night Football...
  ['Mon', 0, 2], // ...until 1:59am
  ['Mon', 20, 24], // Monday Night Football, 8pm...
  ['Tue', 0, 1], // ...through 12:59am
]

export default async function handler() {
  const { weekday, hour } = easternTime(new Date())
  if (!LIVE_WINDOWS.some(([day, start, end]) => day === weekday && hour >= start && hour < end)) {
    console.log('Outside live game windows; skipping matchup sync.')
    return
  }
  await callSyncRoute('/api/espn/sync-matchups')
}
