// The league is based in Cary, NC — deadlines are always shown in this fixed
// zone regardless of where a viewer or the render happens to run. Besides
// being the correct behavior for a deadline every member should agree on
// (rather than each person seeing their own converted local time), a fixed
// zone is also what makes this deterministic: computing "local" time instead
// would depend on the runtime's own clock, which differs between Netlify's
// server (UTC) and a viewer's browser and caused a hydration mismatch in
// components that render on both.
const LEAGUE_TIME_ZONE = 'America/New_York'

export function formatDeadline(isoString: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(new Date(isoString))

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  return `${get('month')}/${get('day')}/${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`
}
