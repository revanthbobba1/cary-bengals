// Shared by the Netlify scheduled functions in netlify/functions/espn-*-sync.mts. Each function
// only decides *whether* to run (in America/New_York wall-clock time, so DST needs no padding),
// then calls the existing /api/espn/sync-* Route Handler over HTTP so auth (x-cron-secret), the
// service-role client, and the sync logic stay in one place.

export function easternTime(now: Date): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  return {
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? '',
    hour: Number(parts.find((p) => p.type === 'hour')?.value),
  }
}

// Scheduled functions are cut off at 30s, so unlike the GitHub workflows this can't wait out a
// Render cold start (up to ~60s). The /healthz ping still wakes the backend even though it gives up
// after 8s, so a run that hits a cold backend may fail and the next one lands warm.
//
// Also used by netlify/functions/poll-reminders.mts (the project's one cron secret has the ESPN
// name); that caller passes warmEspnService: false since the reminder route never touches ESPN.
export async function callSyncRoute(
  path: string,
  { warmEspnService = true }: { warmEspnService?: boolean } = {}
): Promise<void> {
  const siteUrl = process.env.URL
  const cronSecret = process.env.ESPN_SYNC_CRON_SECRET
  if (!siteUrl || !cronSecret) {
    console.error(`${path} not run: URL or ESPN_SYNC_CRON_SECRET is not set.`)
    return
  }

  const serviceUrl = process.env.ESPN_SERVICE_URL
  if (warmEspnService && serviceUrl) {
    await fetch(`${serviceUrl}/healthz`, { signal: AbortSignal.timeout(8000) }).catch(() => {})
  }

  try {
    const response = await fetch(`${siteUrl}${path}`, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret },
      signal: AbortSignal.timeout(18000),
    })
    const body = await response.text()
    if (!response.ok) console.error(`${path} failed: HTTP ${response.status} ${body}`)
    else console.log(`${path} ok: ${body}`)
  } catch (err) {
    console.error(`${path} request failed:`, err)
  }
}
