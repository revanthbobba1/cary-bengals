// Rule-based weekly awards (issue #234). A pure function of one week's matchups, so any week with
// scores can be computed. The home page computes last week live; lib/awards/awardSync.ts runs the
// same rules once per finished week and stores the winners (migration 058) for the trophy cases.
// Bench- and player-based awards need box-score rows (matchup_player_scores) and are skipped for a
// week that doesn't have them. Exact ties award the first team in matchup order; they are rare
// enough that a tiebreak rule isn't worth the complexity.

import { isOnIR } from '@/lib/espn/lineupSort'
import type { Matchup, MatchupPlayerScore } from '@/lib/types/matchup'

export type AwardId =
  | 'high-score'
  | 'low-score'
  | 'blowout'
  | 'nail-biter'
  | 'hard-luck'
  | 'lucky-win'
  | 'benchwarmer'
  | 'top-player'

// The one place an award's emoji and title are defined; the trophy-case badges read it too.
export const AWARD_META: Record<AwardId, { emoji: string; title: string }> = {
  'high-score': { emoji: '🔥', title: 'High Score' },
  'low-score': { emoji: '🚽', title: 'Low Score' },
  blowout: { emoji: '💥', title: 'Blowout' },
  'nail-biter': { emoji: '😰', title: 'Nail-Biter' },
  'hard-luck': { emoji: '💔', title: 'Hard Luck' },
  'lucky-win': { emoji: '🍀', title: 'Lucky Win' },
  benchwarmer: { emoji: '🪑', title: 'Benchwarmer' },
  'top-player': { emoji: '⭐', title: 'Player of the Week' },
}

export interface Award {
  id: AwardId
  emoji: string
  title: string
  teamId: string
  teamName: string
  // One-line explanation, already rendered, e.g. "Scored 142.3, 2nd-highest of the week, and lost".
  detail: string
}

// Just the fields the rules read, so callers with a lighter query than a full Matchup can use it.
export type AwardMatchup = Pick<
  Matchup,
  | 'is_bye'
  | 'home_team_id'
  | 'away_team_id'
  | 'home_score'
  | 'away_score'
  | 'home_player_scores'
  | 'away_player_scores'
>

interface Side {
  teamId: string
  score: number
  oppId: string
  oppScore: number
  players: MatchupPlayerScore[] | null
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

function sidesOf(matchups: AwardMatchup[]): Side[] {
  const sides: Side[] = []
  for (const m of matchups) {
    // A bye has no opponent; a 0-0 game was never scored/synced, not a real tie.
    if (m.is_bye || m.away_team_id === null || m.away_score === null) continue
    if (m.home_score === 0 && m.away_score === 0) continue
    sides.push({
      teamId: m.home_team_id,
      score: m.home_score,
      oppId: m.away_team_id,
      oppScore: m.away_score,
      players: m.home_player_scores,
    })
    sides.push({
      teamId: m.away_team_id,
      score: m.away_score,
      oppId: m.home_team_id,
      oppScore: m.home_score,
      players: m.away_player_scores,
    })
  }
  return sides
}

export function computeWeeklyAwards(
  matchups: AwardMatchup[],
  teamNameById: Record<string, string>
): Award[] {
  const sides = sidesOf(matchups)
  if (sides.length === 0) return []

  const name = (id: string) => teamNameById[id] ?? 'Unknown team'
  const awards: Award[] = []
  const byScoreDesc = [...sides].sort((a, b) => b.score - a.score)
  // 1-based rank among every team's score this week (1 = highest).
  const rankOf = (side: Side) => byScoreDesc.indexOf(side) + 1

  const high = byScoreDesc[0]
  const low = byScoreDesc[byScoreDesc.length - 1]
  awards.push({
    id: 'high-score',
    ...AWARD_META['high-score'],
    teamId: high.teamId,
    teamName: name(high.teamId),
    detail: `Put up ${fmt(high.score)} against ${name(high.oppId)}`,
  })
  if (low !== high) {
    awards.push({
      id: 'low-score',
      ...AWARD_META['low-score'],
      teamId: low.teamId,
      teamName: name(low.teamId),
      detail: `Managed just ${fmt(low.score)} against ${name(low.oppId)}`,
    })
  }

  const winners = sides.filter((s) => s.score > s.oppScore)
  const losers = sides.filter((s) => s.score < s.oppScore)

  const blowout = [...winners].sort((a, b) => b.score - b.oppScore - (a.score - a.oppScore))[0]
  if (blowout) {
    awards.push({
      id: 'blowout',
      ...AWARD_META.blowout,
      teamId: blowout.teamId,
      teamName: name(blowout.teamId),
      detail: `Beat ${name(blowout.oppId)} by ${fmt(blowout.score - blowout.oppScore)}`,
    })
  }

  const nailBiter = [...winners].sort((a, b) => a.score - a.oppScore - (b.score - b.oppScore))[0]
  if (nailBiter && nailBiter !== blowout) {
    awards.push({
      id: 'nail-biter',
      ...AWARD_META['nail-biter'],
      teamId: nailBiter.teamId,
      teamName: name(nailBiter.teamId),
      detail: `Edged ${name(nailBiter.oppId)} by ${fmt(nailBiter.score - nailBiter.oppScore)}`,
    })
  }

  // Hard Luck / Lucky Win only count when the result actually crossed over: the best loser outscored
  // some winner, or the worst winner scored below some loser. If the winners were exactly the top
  // scorers, nobody was unlucky and the award is skipped.
  const hardLuck = [...losers].sort((a, b) => b.score - a.score)[0]
  if (hardLuck && winners.some((w) => w.score < hardLuck.score)) {
    awards.push({
      id: 'hard-luck',
      ...AWARD_META['hard-luck'],
      teamId: hardLuck.teamId,
      teamName: name(hardLuck.teamId),
      detail: `Lost with the ${ordinal(rankOf(hardLuck))}-highest score of the week (${fmt(hardLuck.score)})`,
    })
  }

  const lucky = [...winners].sort((a, b) => a.score - b.score)[0]
  if (lucky && losers.some((l) => l.score > lucky.score)) {
    awards.push({
      id: 'lucky-win',
      ...AWARD_META['lucky-win'],
      teamId: lucky.teamId,
      teamName: name(lucky.teamId),
      detail: `Won with only ${fmt(lucky.score)}, the ${ordinal(sides.length - rankOf(lucky) + 1)}-lowest score of the week`,
    })
  }

  // Box-score awards. IR players never count as "left on the bench" -- they weren't eligible.
  const withPlayers = sides.filter((s) => s.players && s.players.length > 0)
  const benchOf = (side: Side) =>
    (side.players ?? []).filter((p) => !p.is_starter && !isOnIR(p.lineup_slot) && p.points > 0)
  const benchTotal = (side: Side) => benchOf(side).reduce((sum, p) => sum + p.points, 0)
  const benchwarmer = [...withPlayers].sort((a, b) => benchTotal(b) - benchTotal(a))[0]
  if (benchwarmer && benchTotal(benchwarmer) > 0) {
    const best = [...benchOf(benchwarmer)].sort((a, b) => b.points - a.points)[0]
    awards.push({
      id: 'benchwarmer',
      ...AWARD_META.benchwarmer,
      teamId: benchwarmer.teamId,
      teamName: name(benchwarmer.teamId),
      detail: `Left ${fmt(benchTotal(benchwarmer))} points on the bench, including ${best.player_name} (${fmt(best.points)})`,
    })
  }

  let topPlayer: { side: Side; player: MatchupPlayerScore } | null = null
  for (const side of withPlayers) {
    for (const player of side.players ?? []) {
      if (player.is_starter && (!topPlayer || player.points > topPlayer.player.points)) {
        topPlayer = { side, player }
      }
    }
  }
  if (topPlayer && topPlayer.player.points > 0) {
    awards.push({
      id: 'top-player',
      ...AWARD_META['top-player'],
      teamId: topPlayer.side.teamId,
      teamName: name(topPlayer.side.teamId),
      detail: `${topPlayer.player.player_name} (${topPlayer.player.position}) scored ${fmt(topPlayer.player.points)}`,
    })
  }

  return awards
}
