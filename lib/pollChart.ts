export interface PollHistoryRow {
  season_year: number
  week_number: number
  final_rank: number
  team_name: string
  owner_name: string
}

// Owners are matched to league members (author files) by first name, as /league-members does.
export function normalizeOwnerKey(ownerName: string) {
  return ownerName
    .split(' ')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
