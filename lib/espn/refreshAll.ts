// Shared orchestration for the four "already-paired" ESPN refreshes -- team names, rosters, team
// records, and matchups. Extracted out of app/admin/commissioner/espn-refresh-actions.ts now that
// a second caller exists (the service-role-authenticated cron Route Handlers in app/api/espn/),
// so both the commissioner's manual "Refresh ESPN Data" button and the scheduled sync share one
// implementation instead of two copies drifting apart. All four are deterministic updates to
// teams that already have an espn_team_id (no guessing which team is which), unlike the one-time
// pairing flow in teams-sync-actions.ts, which only ever runs from the commissioner UI.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnTeams } from '@/lib/espn/client'
import { syncTeamNames } from '@/lib/espn/teamNameSync'
import { syncRosters } from '@/lib/espn/rosterSync'
import { syncTeamRecords } from '@/lib/espn/teamRecordSync'
import { syncMatchups } from '@/lib/espn/matchupSync'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface EspnDataRefreshResult {
  namesUpdated: number
  teamCount: number
  playerCount: number
  recordsUpdated: number
  matchupsUpdated: number
  warnings: string[]
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to reach ESPN.'
}

export async function refreshAllEspnData(
  supabase: SupabaseServerClient,
  seasonYear: number
): Promise<EspnDataRefreshResult> {
  // Names and records both read ESPN's /teams endpoint -- fetched once here and handed to both,
  // rather than each firing its own request for identical data against a Render free-tier service
  // that can cold-start. A fetch failure here is reported as both syncs failing (they'd have
  // hit the same failure independently anyway) without blocking the unrelated roster fetch.
  const teamsFetch = await fetchEspnTeams(seasonYear).then(
    (value) => ({ ok: true as const, value }),
    (err) => ({ ok: false as const, err })
  )

  // allSettled, not all -- a rejection in one refresh must not mask a committed success in
  // another. All four already wrote to the DB by the time their promise resolves/rejects, so
  // losing track of which ones succeeded would misreport real progress as a total failure.
  // Matchups fetches its own endpoint (schedule, not teams), so it isn't part of the shared
  // teamsFetch above -- a failure there is independent of team names/records failing.
  const [nameSettled, rosterSettled, recordSettled, matchupSettled] = await Promise.allSettled([
    teamsFetch.ok
      ? syncTeamNames(supabase, seasonYear, teamsFetch.value)
      : Promise.reject(teamsFetch.err),
    syncRosters(supabase, seasonYear),
    teamsFetch.ok
      ? syncTeamRecords(supabase, seasonYear, teamsFetch.value)
      : Promise.reject(teamsFetch.err),
    syncMatchups(supabase, seasonYear),
  ])

  const warnings: string[] = []
  let namesUpdated = 0
  let teamCount = 0
  let playerCount = 0
  let recordsUpdated = 0
  let matchupsUpdated = 0

  if (nameSettled.status === 'fulfilled') {
    namesUpdated = nameSettled.value.teamCount
    warnings.push(...nameSettled.value.warnings)
  } else {
    warnings.push(`Team name refresh failed: ${errorMessage(nameSettled.reason)}`)
  }

  if (rosterSettled.status === 'fulfilled') {
    teamCount = rosterSettled.value.teamCount
    playerCount = rosterSettled.value.playerCount
    warnings.push(...rosterSettled.value.warnings)
  } else {
    warnings.push(`Roster refresh failed: ${errorMessage(rosterSettled.reason)}`)
  }

  if (recordSettled.status === 'fulfilled') {
    recordsUpdated = recordSettled.value.teamCount
    warnings.push(...recordSettled.value.warnings)
  } else {
    warnings.push(`Team record refresh failed: ${errorMessage(recordSettled.reason)}`)
  }

  if (matchupSettled.status === 'fulfilled') {
    matchupsUpdated = matchupSettled.value.matchupCount
    warnings.push(...matchupSettled.value.warnings)
  } else {
    warnings.push(`Matchup refresh failed: ${errorMessage(matchupSettled.reason)}`)
  }

  return { namesUpdated, teamCount, playerCount, recordsUpdated, matchupsUpdated, warnings }
}
