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

export async function fetchEspnTeams(season: number): Promise<EspnLeagueTeamsResponse> {
  const baseUrl = process.env.ESPN_SERVICE_URL
  const token = process.env.ESPN_SERVICE_TOKEN

  if (!baseUrl || !token) {
    throw new Error('ESPN_SERVICE_URL and ESPN_SERVICE_TOKEN must be configured to sync from ESPN.')
  }

  const response = await fetch(`${baseUrl}/v1/league/${season}/teams`, {
    headers: { 'X-Service-Token': token },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ESPN service returned ${response.status}${body ? `: ${body}` : ''}`)
  }

  return response.json() as Promise<EspnLeagueTeamsResponse>
}
