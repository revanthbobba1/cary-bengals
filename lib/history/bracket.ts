// Playoff bracket inference for the League History page (issue #194).
//
// `matchups` carries no flag separating the winners' bracket from consolation games: all 12
// teams play in each of the three playoff weeks. The bracket is recoverable from its shape, which
// is the same in every backfilled season (2022-2025): 6 teams make it, the top 2 get a first-week
// bye, and the semifinals are the second-week games that involve a bye team.
//
//   week 1: 2 quarterfinals (the games whose winner goes on to face a bye team) + byes
//   week 2: 2 semifinals (bye team vs. a quarterfinal winner)
//   week 3: final (semifinal winners) and third-place game (semifinal losers)
//
// Anything that does not fit that shape (a tie, a different layout) returns null instead of a
// guess; the page then shows standings without a bracket.

export interface PlayoffRow {
  week_number: number
  is_bye: boolean
  home_team_id: string
  away_team_id: string | null
  home_score: number
  away_score: number
  winner: string
}

export interface BracketGame {
  week: number
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  winnerTeamId: string
}

export interface Bracket {
  byeTeamIds: string[]
  quarterfinals: BracketGame[]
  semifinals: BracketGame[]
  final: BracketGame
  thirdPlace: BracketGame
  championId: string
  runnerUpId: string
  // Every team that made the playoffs (the byes plus both sides of each quarterfinal).
  playoffTeamIds: string[]
}

function toGame(row: PlayoffRow): BracketGame | null {
  if (row.is_bye || row.away_team_id === null) return null
  if (row.winner !== 'HOME' && row.winner !== 'AWAY') return null
  return {
    week: row.week_number,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeamId: row.winner === 'HOME' ? row.home_team_id : row.away_team_id,
  }
}

function loserOf(game: BracketGame): string {
  return game.winnerTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
}

function involves(game: BracketGame, teamId: string): boolean {
  return game.homeTeamId === teamId || game.awayTeamId === teamId
}

// One season's playoff rows in, its bracket out (null if the season doesn't fit the shape).
export function inferBracket(rows: PlayoffRow[]): Bracket | null {
  const weeks = [...new Set(rows.map((row) => row.week_number))].sort((a, b) => a - b)
  if (weeks.length !== 3) return null

  const byeTeamIds = rows.filter((row) => row.is_bye).map((row) => row.home_team_id)
  if (byeTeamIds.length !== 2) return null

  // A game with a tie (or any undecided winner) makes the bracket ambiguous.
  const gamesByWeek = weeks.map((week) => {
    const weekRows = rows.filter((row) => row.week_number === week && !row.is_bye)
    const games = weekRows.map(toGame)
    return games.every((game): game is BracketGame => game !== null) ? games : null
  })
  if (gamesByWeek.some((games) => games === null)) return null
  const [week1, week2, week3] = gamesByWeek as BracketGame[][]

  const semifinals = byeTeamIds.map((teamId) => week2.find((game) => involves(game, teamId)))
  if (semifinals.some((game) => game === undefined)) return null
  const semis = semifinals as BracketGame[]
  if (semis[0] === semis[1]) return null

  const semiWinners = semis.map((game) => game.winnerTeamId)
  const semiLosers = semis.map(loserOf)
  const final = week3.find((game) => semiWinners.every((teamId) => involves(game, teamId)))
  const thirdPlace = week3.find((game) => semiLosers.every((teamId) => involves(game, teamId)))
  if (!final || !thirdPlace) return null

  // A quarterfinal is the first-week game whose winner faced a bye team in the semifinals.
  const semiOpponents = semis.map((game, i) =>
    game.homeTeamId === byeTeamIds[i] ? game.awayTeamId : game.homeTeamId
  )
  const quarterfinals = semiOpponents.map((teamId) =>
    week1.find((game) => game.winnerTeamId === teamId)
  )
  if (quarterfinals.some((game) => game === undefined)) return null
  const quarters = quarterfinals as BracketGame[]

  return {
    byeTeamIds,
    quarterfinals: quarters,
    semifinals: semis,
    final,
    thirdPlace,
    championId: final.winnerTeamId,
    runnerUpId: loserOf(final),
    playoffTeamIds: [
      ...byeTeamIds,
      ...quarters.flatMap((game) => [game.homeTeamId, game.awayTeamId]),
    ],
  }
}
