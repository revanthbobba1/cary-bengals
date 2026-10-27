import PlayerStatusBadge from '@/components/PlayerStatusBadge'

// Shared with RosterModal.tsx and MatchupBoxScore.tsx -- both render an identical pill next to a
// bench player on IR.
export default function IRBadge() {
  return <PlayerStatusBadge label="IR" />
}
