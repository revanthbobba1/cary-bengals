// Playoff odds and clinch/elimination for issue #219. Pure functions, no I/O.
//
// League shape (same as lib/history/bracket.ts): 12 teams, 6 make the playoffs, the top 2 get a
// first-round bye. Standings order by win % then points for; ESPN's own tiebreakers (head-to-head,
// division record) are not replicated, matching the history migration.
//
// Odds come from a Monte Carlo simulation of the remaining regular-season games. Each team's
// score is drawn from a normal distribution around its (shrunk-toward-the-league) average, so the
// simulation also produces points for, which decides ties in the standings.
//
// Clinch/elimination is NOT taken from the simulation (a 100% in 5,000 runs is not a proof).
// It uses win-count bounds instead: a team has clinched when at most N-1 other teams can still
// finish at or above its current wins, and is eliminated when N or more teams already sit strictly
// above its best possible finish. Ties in wins are assumed to be lost, so this is conservative:
// it can miss a clinch that head-to-head scheduling would allow, but never claims a false one.
//
// A game in progress is simulated from scratch (its partial score is ignored), which is fine for
// odds that refresh with every sync.

export const PLAYOFF_TEAMS = 6
export const BYE_TEAMS = 2

const SIMULATIONS = 5000
// Pseudo-games of league-average scoring blended into each team's average, so one big week early
// in the season doesn't make a team look like a juggernaut.
const SHRINKAGE_GAMES = 3
const DEFAULT_MEAN = 100
const DEFAULT_SD = 20

export interface OddsGame {
  homeTeamId: string
  awayTeamId: string
  // Final games carry real scores; anything else is simulated.
  isFinal: boolean
  homeScore: number
  awayScore: number
}

export type PlayoffStatus = 'clinched-bye' | 'clinched' | 'eliminated' | 'alive'

export interface TeamOdds {
  teamId: string
  status: PlayoffStatus
  // Percent chances, 0-100.
  playoffPct: number
  byePct: number
  lastPct: number
}

// mulberry32: tiny seeded PRNG so server renders are stable between requests with the same data.
function makeRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(random: () => number) {
  // Box-Muller; 1 - random() keeps the log argument in (0, 1].
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
}

function seedFrom(games: OddsGame[]) {
  let h = 2166136261
  for (const g of games) {
    if (!g.isFinal) continue
    h = Math.imul(h ^ Math.round(g.homeScore * 100), 16777619)
    h = Math.imul(h ^ Math.round(g.awayScore * 100), 16777619)
  }
  return h
}

export function computePlayoffOdds(teamIds: string[], games: OddsGame[]): TeamOdds[] {
  const n = teamIds.length
  const index = new Map(teamIds.map((id, i) => [id, i]))
  const played = games.filter(
    (g) => g.isFinal && index.has(g.homeTeamId) && index.has(g.awayTeamId)
  )
  const remaining = games.filter(
    (g) => !g.isFinal && index.has(g.homeTeamId) && index.has(g.awayTeamId)
  )

  const points = new Array<number>(n).fill(0) // win points: 1 per win, 0.5 per tie
  const pointsFor = new Array<number>(n).fill(0)
  const scores: number[][] = teamIds.map(() => [])
  for (const g of played) {
    const h = index.get(g.homeTeamId)!
    const a = index.get(g.awayTeamId)!
    pointsFor[h] += g.homeScore
    pointsFor[a] += g.awayScore
    scores[h].push(g.homeScore)
    scores[a].push(g.awayScore)
    if (g.homeScore > g.awayScore) points[h] += 1
    else if (g.homeScore < g.awayScore) points[a] += 1
    else {
      points[h] += 0.5
      points[a] += 0.5
    }
  }
  const gamesLeft = new Array<number>(n).fill(0)
  for (const g of remaining) {
    gamesLeft[index.get(g.homeTeamId)!]++
    gamesLeft[index.get(g.awayTeamId)!]++
  }

  // --- Clinch / elimination from win bounds ---
  const status = teamIds.map((_, i): PlayoffStatus => {
    const min = points[i]
    const max = points[i] + gamesLeft[i]
    let canReachMin = 0 // other teams that could finish at or above my current wins
    let alreadyAboveMax = 0 // other teams already strictly above my best possible finish
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      if (points[j] + gamesLeft[j] >= min) canReachMin++
      if (points[j] > max) alreadyAboveMax++
    }
    if (alreadyAboveMax >= PLAYOFF_TEAMS) return 'eliminated'
    if (canReachMin < BYE_TEAMS) return 'clinched-bye'
    if (canReachMin < PLAYOFF_TEAMS) return 'clinched'
    return 'alive'
  })

  // --- Monte Carlo ---
  const allScores = played.flatMap((g) => [g.homeScore, g.awayScore])
  const leagueMean = allScores.length
    ? allScores.reduce((s, x) => s + x, 0) / allScores.length
    : DEFAULT_MEAN
  const leagueSd =
    allScores.length > 1
      ? Math.sqrt(allScores.reduce((s, x) => s + (x - leagueMean) ** 2, 0) / (allScores.length - 1))
      : DEFAULT_SD
  const mean = scores.map(
    (s) =>
      (s.reduce((a, b) => a + b, 0) + SHRINKAGE_GAMES * leagueMean) / (s.length + SHRINKAGE_GAMES)
  )

  const playoffHits = new Array<number>(n).fill(0)
  const byeHits = new Array<number>(n).fill(0)
  const lastHits = new Array<number>(n).fill(0)
  const random = makeRandom(seedFrom(played))
  const order = teamIds.map((_, i) => i)

  for (let sim = 0; sim < SIMULATIONS; sim++) {
    const simPoints = points.slice()
    const simPf = pointsFor.slice()
    for (const g of remaining) {
      const h = index.get(g.homeTeamId)!
      const a = index.get(g.awayTeamId)!
      const hs = mean[h] + leagueSd * normal(random)
      const as = mean[a] + leagueSd * normal(random)
      simPf[h] += hs
      simPf[a] += as
      if (hs > as) simPoints[h] += 1
      else simPoints[a] += 1
    }
    order.sort((x, y) => simPoints[y] - simPoints[x] || simPf[y] - simPf[x])
    for (let rank = 0; rank < n; rank++) {
      const team = order[rank]
      if (rank < PLAYOFF_TEAMS) playoffHits[team]++
      if (rank < BYE_TEAMS) byeHits[team]++
      if (rank === n - 1) lastHits[team]++
    }
  }

  return teamIds.map((teamId, i) => {
    const st = status[i]
    // The simulation can't prove anything, so a decided status pins the odds and an undecided one
    // never rounds to a certainty.
    const pct = (hits: number) => (hits / SIMULATIONS) * 100
    const soft = (hits: number) =>
      hits === 0 ? 0 : Math.min(99, Math.max(1, Math.round(pct(hits))))
    return {
      teamId,
      status: st,
      playoffPct: st === 'eliminated' ? 0 : st !== 'alive' ? 100 : soft(playoffHits[i]),
      byePct: st === 'clinched-bye' ? 100 : st === 'eliminated' ? 0 : soft(byeHits[i]),
      lastPct: soft(lastHits[i]),
    }
  })
}
