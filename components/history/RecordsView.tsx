import type { GameRecord, RecordsData, Streak } from '@/lib/history/recordsData'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">{title}</h2>
      {children}
    </section>
  )
}

function Rows({
  rows,
}: {
  rows: { key: string; left: React.ReactNode; right: React.ReactNode }[]
}) {
  return (
    <ol className="divide-y divide-gray-200 text-sm dark:divide-gray-800">
      {rows.map((row, i) => (
        <li key={row.key} className="flex items-baseline justify-between gap-4 py-2">
          <span>
            <span className="pr-2 tabular-nums text-gray-400">{i + 1}.</span>
            {row.left}
          </span>
          <span className="shrink-0 tabular-nums font-semibold">{row.right}</span>
        </li>
      ))}
    </ol>
  )
}

const when = (season: number, week: number) => `${season} wk ${week}`

function gameRows(games: GameRecord[], right: (game: GameRecord) => string) {
  return games.map((game, i) => ({
    key: `${game.season_year}-${game.week_number}-${game.team_name}-${i}`,
    left: (
      <>
        {game.owner_name} <span className="text-gray-500">vs {game.opp_owner_name}</span>{' '}
        <span className="text-gray-400">
          · {when(game.season_year, game.week_number)}
          {game.is_playoffs ? ' (postseason)' : ''}
        </span>
      </>
    ),
    right: right(game),
  }))
}

function streakRows(streaks: Streak[]) {
  return streaks.map((streak, i) => ({
    key: `${streak.owner_name}-${streak.startSeason}-${streak.startWeek}-${i}`,
    left: (
      <>
        {streak.owner_name}{' '}
        <span className="text-gray-400">
          · {when(streak.startSeason, streak.startWeek)} to {when(streak.endSeason, streak.endWeek)}
        </span>
      </>
    ),
    right: `${streak.length} games`,
  }))
}

export default function RecordsView({ data }: { data: RecordsData }) {
  // Matrix rows/columns are the owners present in the head-to-head view, in name order.
  const owners = [
    ...new Map(data.headToHead.map((row) => [row.owner_id, row.owner_name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const cell = new Map(data.headToHead.map((row) => [`${row.owner_id}|${row.opp_owner_id}`, row]))

  return (
    <div className="space-y-12">
      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Highest scores">
          <Rows rows={gameRows(data.highScores, (g) => g.pf.toFixed(2))} />
        </Section>
        <Section title="Lowest scores">
          <Rows rows={gameRows(data.lowScores, (g) => g.pf.toFixed(2))} />
        </Section>
        <Section title="Biggest blowouts">
          <Rows rows={gameRows(data.blowouts, (g) => `+${g.margin.toFixed(2)}`)} />
        </Section>
        <Section title="Closest finishes">
          <Rows rows={gameRows(data.closest, (g) => `+${g.margin.toFixed(2)}`)} />
        </Section>
        <Section title="Longest win streaks">
          <Rows rows={streakRows(data.winStreaks)} />
        </Section>
        <Section title="Longest losing streaks">
          <Rows rows={streakRows(data.lossStreaks)} />
        </Section>
        <Section title="Best starter games">
          <Rows
            rows={data.playerGames.map((game, i) => ({
              key: `${game.player_name}-${game.season_year}-${game.week_number}-${i}`,
              left: (
                <>
                  {game.player_name} <span className="text-gray-500">({game.position})</span>{' '}
                  <span className="text-gray-400">
                    · {game.owner_name}, {when(game.season_year, game.week_number)}
                  </span>
                </>
              ),
              right: game.points.toFixed(2),
            }))}
          />
        </Section>
        <Section title="Most bench points in a week">
          <Rows
            rows={data.benchWeeks.map((week, i) => ({
              key: `${week.owner_name}-${week.season_year}-${week.week_number}-${i}`,
              left: (
                <>
                  {week.owner_name}{' '}
                  <span className="text-gray-400">
                    · {when(week.season_year, week.week_number)}
                  </span>
                </>
              ),
              right: week.bench_points.toFixed(2),
            }))}
          />
        </Section>
      </div>

      <Section title="Head-to-head">
        <p className="pb-3 text-sm text-gray-500">
          Row owner&apos;s record against column owner, all games including the postseason
          (consolation games count).
        </p>
        <div className="overflow-x-auto">
          <table className="text-center text-xs">
            <thead>
              <tr>
                <th className="p-2" />
                {owners.map(([id, name]) => (
                  <th key={id} className="p-2 font-medium text-gray-500">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {owners.map(([rowId, rowName]) => (
                <tr key={rowId} className="border-t border-gray-200 dark:border-gray-800">
                  <th className="p-2 text-left font-medium">{rowName}</th>
                  {owners.map(([colId]) => {
                    const record = cell.get(`${rowId}|${colId}`)
                    if (!record)
                      return (
                        <td key={colId} className="p-2 text-gray-300">
                          –
                        </td>
                      )
                    const tone =
                      record.wins > record.losses
                        ? 'text-green-600 dark:text-green-400'
                        : record.wins < record.losses
                          ? 'text-red-600 dark:text-red-400'
                          : ''
                    return (
                      <td key={colId} className={`p-2 tabular-nums ${tone}`}>
                        {record.wins}-{record.losses}
                        {record.ties > 0 ? `-${record.ties}` : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
