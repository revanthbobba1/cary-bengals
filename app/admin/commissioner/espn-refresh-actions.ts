'use server'

// Server Action combining the three "already-paired" ESPN refreshes -- team names, rosters, and
// team records -- into one commissioner-facing action. All three are deterministic updates to
// teams that already have an espn_team_id (no guessing which team is which), unlike the one-time
// pairing flow in teams-sync-actions.ts, so there's no reason to make the commissioner run
// separate buttons for them. See lib/espn/teamNameSync.ts, lib/espn/rosterSync.ts, and
// lib/espn/teamRecordSync.ts for the reusable core logic (kept as plain functions, not folded
// into this file, so a future cron/Route Handler can call them directly without going through a
// Server Action at all).

import { fetchEspnTeams } from '@/lib/espn/client'
import { syncTeamNames } from '@/lib/espn/teamNameSync'
import { syncRosters } from '@/lib/espn/rosterSync'
import { syncTeamRecords } from '@/lib/espn/teamRecordSync'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export interface EspnDataRefreshResult {
  namesUpdated: number
  teamCount: number
  playerCount: number
  recordsUpdated: number
  warnings: string[]
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to reach ESPN.'
}

export async function refreshEspnDataAction(
  seasonYear: number
): Promise<ActionResult<EspnDataRefreshResult>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }
  const { supabase } = auth

  // Names and records both read ESPN's /teams endpoint -- fetched once here and handed to both,
  // rather than each firing its own request for identical data against a Render free-tier service
  // that can cold-start. A fetch failure here is reported as both syncs failing (they'd have
  // hit the same failure independently anyway) without blocking the unrelated roster fetch.
  const teamsFetch = await fetchEspnTeams(seasonYear).then(
    (value) => ({ ok: true as const, value }),
    (err) => ({ ok: false as const, err })
  )

  // allSettled, not all -- a rejection in one refresh must not mask a committed success in
  // another. All three already wrote to the DB by the time their promise resolves/rejects, so
  // losing track of which ones succeeded would misreport real progress as a total failure.
  const [nameSettled, rosterSettled, recordSettled] = await Promise.allSettled([
    teamsFetch.ok
      ? syncTeamNames(supabase, seasonYear, teamsFetch.value)
      : Promise.reject(teamsFetch.err),
    syncRosters(supabase, seasonYear),
    teamsFetch.ok
      ? syncTeamRecords(supabase, seasonYear, teamsFetch.value)
      : Promise.reject(teamsFetch.err),
  ])

  const warnings: string[] = []
  let namesUpdated = 0
  let teamCount = 0
  let playerCount = 0
  let recordsUpdated = 0

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

  return { data: { namesUpdated, teamCount, playerCount, recordsUpdated, warnings }, error: null }
}
