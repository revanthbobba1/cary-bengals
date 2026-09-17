// Typed fetch wrapper for the ESPN sync FastAPI service (backend/). Server-only: ESPN_SERVICE_URL
// and ESPN_SERVICE_TOKEN carry no NEXT_PUBLIC_ prefix and this module is only ever imported from
// Server Actions, so it never reaches the client bundle. See docs/ESPN_INTEGRATION_PLAN.md §6.

export interface EspnTeamRecord {
  wins: number
  losses: number
  ties: number
}

export interface EspnTeam {
  espn_team_id: number
  name: string
  espn_owner_id: string | null
  owner_display_name: string | null
  record: EspnTeamRecord
}

export interface EspnLeagueTeamsResponse {
  season: number
  league_id: string
  fetched_at: string
  teams: EspnTeam[]
  warnings: string[]
}

// Kept comfortably under Netlify's default 10s synchronous function ceiling so this code's own
// catch block (a clear, actionable message) gets to run instead of the platform silently killing
// the Server Action first. §2.6 documents Render's free-tier cold start as up to ~60s -- no
// timeout value here makes a cold start itself succeed, this only ensures a fast, clear failure
// instead of an opaque platform-level 502/504.
const ESPN_FETCH_TIMEOUT_MS = 8_000

export async function fetchEspnTeams(season: number): Promise<EspnLeagueTeamsResponse> {
  const baseUrl = process.env.ESPN_SERVICE_URL
  const token = process.env.ESPN_SERVICE_TOKEN

  if (!baseUrl || !token) {
    throw new Error('ESPN_SERVICE_URL and ESPN_SERVICE_TOKEN must be configured to sync from ESPN.')
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/league/${season}/teams`, {
      headers: { 'X-Service-Token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(ESPN_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(
        `ESPN service did not respond within ${ESPN_FETCH_TIMEOUT_MS / 1000}s — it may be cold-starting (Render's free tier can take up to ~60s after 15min idle). Try again in a moment.`
      )
    }
    throw err
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ESPN service returned ${response.status}${body ? `: ${body}` : ''}`)
  }

  return response.json() as Promise<EspnLeagueTeamsResponse>
}
