import type { MatchupPlayerScore } from '@/lib/types/matchup'

// Display order and short form for each stat category the backend labels (see STAT_IDS in
// backend/app/espn_labels.py). An ordered list on purpose: Postgres JSONB doesn't preserve key
// order, so iterating stat_breakdown directly would scramble the line. Abbreviations are
// prefixed (pass/rush/rec) because a flex player can post yards and TDs in more than one.
const STAT_DISPLAY: Array<[label: string, short: string]> = [
  ['Passing Yards', 'pass yds'],
  ['Passing TDs', 'pass TD'],
  ['INT', 'INT'],
  ['Rushing Yards', 'rush yds'],
  ['Rushing TDs', 'rush TD'],
  ['Receptions', 'rec'],
  ['Receiving Yards', 'rec yds'],
  ['Receiving TDs', 'rec TD'],
  ['Fumbles Lost', 'fum'],
]

// e.g. "321 pass yds · 2 pass TD · 1 INT". Empty string when there's nothing to show.
export function formatStatBreakdown(breakdown: MatchupPlayerScore['stat_breakdown']): string {
  return STAT_DISPLAY.flatMap(([label, short]) => {
    const value = breakdown[label]
    if (!value) return []
    return `${Number.isInteger(value) ? value : value.toFixed(1)} ${short}`
  }).join(' · ')
}
