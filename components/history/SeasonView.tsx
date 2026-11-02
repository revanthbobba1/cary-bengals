import Link from 'next/link'
import TeamLogo from '@/components/TeamLogo'
import type { HistoryBase, TeamInfo } from '@/lib/history/historyData'
import { ownerSlug } from '@/lib/history/historyData'
import type { BracketGame } from '@/lib/history/bracket'

function TeamLabel({ team }: { team: TeamInfo | undefined }) {
  if (!team) return <span>Unknown team</span>
  return (
    <span className="inline-flex items-center gap-2">
      <TeamLogo src={team.logo} />
      <span>{team.name}</span>
    </span>
  )
}

function GameRow({
  game,
  teams,
  label,
}: {
  game: BracketGame
  teams: HistoryBase['teamsById']
  label?: string
}) {
  const sides = [
    { id: game.homeTeamId, score: game.homeScore },
    { id: game.awayTeamId, score: game.awayScore },
  ]
  return (
    <div className="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
      {label && <p className="pb-1 text-xs uppercase tracking-wide text-gray-500">{label}</p>}
      {sides.map((side) => (
        <div
          key={side.id}
          className={`flex items-center justify-between gap-3 ${
            side.id === game.winnerTeamId
              ? 'font-semibold text-ink dark:text-gray-100'
              : 'text-gray-500'
          }`}
        >
          <TeamLabel team={teams[side.id]} />
          <span className="tabular-nums">{side.score.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

export default function SeasonView({ base, season }: { base: HistoryBase; season: number }) {
  const rows = base.teamSeasons
    .filter((row) => row.season_year === season)
    .sort((a, b) => a.standings_rank - b.standings_rank)
  const bracket = base.results[season]?.bracket ?? null
  const champion = bracket ? base.teamsById[bracket.championId] : undefined
  const runnerUp = bracket ? base.teamsById[bracket.runnerUpId] : undefined

  return (
    <div className="space-y-10">
      {bracket && champion && runnerUp ? (
        <section className="rounded-lg border border-primary-500/40 bg-primary-500/5 p-5">
          <p className="text-sm uppercase tracking-wide text-gray-500">{season} champion</p>
          <p className="text-2xl font-bold text-ink dark:text-gray-100">
            <TeamLabel team={champion} />
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            <Link
              href={`/history/owner/${ownerSlug(champion.owner_name)}`}
              className="hover:underline"
            >
              {champion.owner_name}
            </Link>{' '}
            · runner-up {runnerUp.name} ({runnerUp.owner_name})
          </p>
        </section>
      ) : (
        <p className="text-gray-600 dark:text-gray-400">
          The playoff bracket for {season} could not be determined, so only standings are shown.
        </p>
      )}

      <section>
        <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Final standings</h2>
        <p className="pb-3 text-sm text-gray-500">
          Regular season. Points are summed from weekly matchups. All-play is the record had the
          team played every other team every week; a large gap from the real record is luck.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Team</th>
                <th className="py-2 pr-2">Record</th>
                <th className="py-2 pr-2 text-right">PF</th>
                <th className="py-2 pr-2 text-right">PA</th>
                <th className="py-2 pr-2 text-right">PF rank</th>
                <th className="py-2 text-right">All-play</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team_id} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="py-2 pr-2 tabular-nums">{row.standings_rank}</td>
                  <td className="py-2 pr-2">
                    <TeamLabel team={base.teamsById[row.team_id]} />
                    <span className="block text-xs text-gray-500">{row.owner_name}</span>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    {row.wins}-{row.losses}
                    {row.ties > 0 ? `-${row.ties}` : ''}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.points_for.toFixed(2)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {row.points_against.toFixed(2)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.points_for_rank}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.all_play_wins}-{row.all_play_losses}
                    {row.all_play_ties > 0 ? `-${row.all_play_ties}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bracket && (
        <section>
          <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Playoff bracket</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500">Quarterfinals</h3>
              {bracket.quarterfinals.map((game) => (
                <GameRow key={game.homeTeamId} game={game} teams={base.teamsById} />
              ))}
              <p className="text-xs text-gray-500">
                Byes: {bracket.byeTeamIds.map((id) => base.teamsById[id]?.name).join(', ')}
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500">Semifinals</h3>
              {bracket.semifinals.map((game) => (
                <GameRow key={game.homeTeamId} game={game} teams={base.teamsById} />
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500">Finals</h3>
              <GameRow game={bracket.final} teams={base.teamsById} label="Championship" />
              <GameRow game={bracket.thirdPlace} teams={base.teamsById} label="Third place" />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
