// Emails voters who haven't submitted a ballot when a poll week is within its reminder window
// (poll_weeks.reminder_hours_before of the deadline). See docs/POLL_REMINDERS_PLAN.md.
//
// Meant to be called every ~15 minutes by a scheduled job (Phase 4, not built yet). Safe to call
// as often as you like: each week is claimed atomically via reminder_sent_at, so a week is
// emailed at most once per deadline value (migration 054 clears the flag if the deadline moves).
//
// Reuses ESPN_SYNC_CRON_SECRET for the x-cron-secret check -- it is the project's one cron secret,
// despite the ESPN name.

import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/espn/cronAuth'
import { createServiceRoleClient } from '@/lib/supabase/serviceRole'
import { sendPollReminder } from '@/lib/email/pollReminder'

// nodemailer needs Node APIs, so this must not run on the Edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WeekResult = {
  weekNumber: number
  recipients: number
  sent: number
  failed: number
  dryRun: boolean
  skipped?: string
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const now = Date.now()

    const { data: candidates, error: candidatesError } = await supabase
      .from('poll_weeks')
      .select('id, week_number, deadline, reminder_hours_before')
      .eq('is_locked', false)
      .is('reminder_sent_at', null)
      .gt('deadline', new Date(now).toISOString())
    if (candidatesError) throw new Error(candidatesError.message)

    // The "within N hours" test uses a per-row column, so it can't be a PostgREST filter.
    const due = (candidates ?? []).filter(
      (week) => new Date(week.deadline).getTime() - now <= week.reminder_hours_before * 3_600_000
    )

    const weeks: WeekResult[] = []

    for (const week of due) {
      const result: WeekResult = {
        weekNumber: week.week_number,
        recipients: 0,
        sent: 0,
        failed: 0,
        dryRun: false,
      }

      // Claim the week. The IS NULL guard makes this atomic: if an overlapping run got here first
      // the update matches no row and we skip it.
      const { data: claimed, error: claimError } = await supabase
        .from('poll_weeks')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', week.id)
        .is('reminder_sent_at', null)
        .select('id')
      if (claimError) throw new Error(claimError.message)
      if (!claimed || claimed.length === 0) {
        result.skipped = 'already claimed'
        weeks.push(result)
        continue
      }

      // Un-claims the week so the next run retries it. Returns false (and logs) if the un-claim
      // itself fails, so the result never claims a retry that can't happen.
      const release = async (): Promise<boolean> => {
        const { error } = await supabase
          .from('poll_weeks')
          .update({ reminder_sent_at: null })
          .eq('id', week.id)
        if (error) {
          console.error(`Week ${week.week_number}: could not release claim: ${error.message}`)
        }
        return !error
      }

      const { data: votersData, error: votersError } = await supabase.rpc(
        'get_unsubmitted_voters',
        { p_poll_week_id: week.id }
      )
      if (votersError) {
        // Nothing was sent; let the next run retry.
        const released = await release()
        console.error(`Week ${week.week_number}: voter lookup failed: ${votersError.message}`)
        result.skipped = released
          ? 'voter lookup failed; will retry'
          : 'voter lookup failed; claim stuck'
        weeks.push(result)
        continue
      }

      const voters = votersData ?? []
      result.recipients = voters.length
      for (const voter of voters) {
        try {
          const { dryRun } = await sendPollReminder({
            to: voter.email,
            fullName: voter.full_name,
            weekNumber: week.week_number,
            deadline: week.deadline,
          })
          result.sent += 1
          result.dryRun = dryRun
        } catch (err) {
          result.failed += 1
          console.error(`Week ${week.week_number}: send to ${voter.email} failed:`, err)
        }
      }

      // If nobody got an email, put the week back so the next run retries (e.g. Gmail credentials
      // briefly invalid). A partial failure stays claimed: re-sending would double-email the
      // recipients that already succeeded, and failures are logged above.
      if (result.recipients > 0 && result.sent === 0) {
        result.skipped = (await release())
          ? 'all sends failed; will retry'
          : 'all sends failed; claim stuck'
      }
      weeks.push(result)
    }

    return NextResponse.json({ checked: candidates?.length ?? 0, due: due.length, weeks })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reminder run failed.'
    console.error('send-reminders failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
