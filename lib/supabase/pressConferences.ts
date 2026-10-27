import { createPublicClient } from './public'
import type { PressConference } from '@/lib/types/pressConference'

/**
 * All press conferences, newest season/week first. The public page groups these by season_year
 * client-side (already sorted, so that's just a single pass) -- no separate "by year" query is
 * needed since the whole table is small (growing ~1/week in-season) and public.
 */
export async function getPressConferences(): Promise<PressConference[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('press_conferences')
    .select('*')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })

  if (error) throw error
  return data ?? []
}
