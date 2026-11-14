// Read path for an owner's weekly-award badges: the `league_owner_awards` view (migration 058)
// holds one small row per (owner, award), so this is never near PostgREST's row cap.

import { createPublicClient } from '@/lib/supabase/public'
import { AWARD_META, type AwardId } from '@/lib/awards/weeklyAwards'

export interface OwnerAwardCount {
  id: AwardId
  wins: number
}

// Most-won first. Degrades to an empty list when Supabase is unconfigured, the read fails, or the
// migration isn't applied yet -- the trophy case just shows no badges, never an error page.
export async function loadOwnerAwardCounts(ownerId: string): Promise<OwnerAwardCount[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || url.includes('your-project-ref')) return []

  const { data, error } = await createPublicClient()
    .from('league_owner_awards')
    .select('award_id, wins')
    .eq('owner_id', ownerId)
  if (error) {
    console.error('Failed to load owner award counts:', error)
    return []
  }

  return (data ?? [])
    .filter((row): row is { award_id: AwardId; wins: number } => row.award_id in AWARD_META)
    .map((row) => ({ id: row.award_id, wins: row.wins }))
    .sort((a, b) => b.wins - a.wins || a.id.localeCompare(b.id))
}
