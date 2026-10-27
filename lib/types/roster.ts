export interface RosterPlayer {
  id: string
  team_id: string
  player_name: string
  position: string
  pro_team: string
  lineup_slot: string
  is_starter: boolean
  sort_order: number
  synced_at: string
  injured: boolean
  acquisition_type: string | null
}
