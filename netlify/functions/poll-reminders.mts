// Netlify-scheduled poll reminder check (issue #131, docs/POLL_REMINDERS_PLAN.md Phase 4).
// Every hour, on the hour, it asks /api/polls/send-reminders whether any open poll week is inside
// its reminder window. Hourly is plenty for the 4-hour default lead (the email lands 3-4 hours
// before the deadline); keep the interval well under the shortest lead time you configure. No
// time-of-day gating: a deadline can fall at any hour, and the route claims each week atomically
// via poll_weeks.reminder_sent_at, so a week is emailed at most once per deadline value.
//
// Emails are only logged, not sent, until GMAIL_USER and GMAIL_APP_PASSWORD are set in Netlify
// (see lib/email/sendEmail.ts). Auth and the service-role client live in the Route Handler; see
// netlify/lib/espnCron.ts for the shared call helper.

import { callSyncRoute } from '../lib/espnCron'

export const config = { schedule: '0 * * * *' }

export default async function handler() {
  await callSyncRoute('/api/polls/send-reminders', { warmEspnService: false })
}
