'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import TeamLogo from './TeamLogo'
import { focusRingClasses } from '@/lib/focusRing'
import { teamKey, type Transaction, type TransactionItem } from '@/lib/types/transaction'

interface Props {
  // One season's transactions (the server loads only the selected season).
  transactions: Transaction[]
  seasons: number[]
  season: number | null
  defaultSeason: number | null
  teams: { espnTeamId: number; name: string }[]
  teamNameByKey: Record<string, string>
  teamLogoByKey: Record<string, string | null>
  // Already-validated from the page's `?week=` / `?team=` params (null if absent/invalid).
  // `initialWeek` of 'all' means the whole season.
  initialWeek: number | 'all' | null
  initialTeam: number | null
}

// The league plays in Eastern time, and waivers process around midnight ET, so grouping by the
// viewer's local day would split one waiver run across two headings for anyone west of ET.
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
const DAY_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })

function describePlayer(item: TransactionItem): string {
  return `${item.player_name} (${item.position}${item.pro_team !== 'FA' ? `, ${item.pro_team}` : ''})`
}

function formatBid(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

const FAILURE_REASONS: Record<string, string> = {
  FAILED_ROSTERLIMIT: 'roster was full',
  FAILED_PLAYERALREADYDROPPED: 'player was already dropped',
  FAILED_AUCTIONBUDGETEXCEEDED: 'over budget',
}

// Lists each failed bid directly under the claim that beat it, highest bid first, so every offer
// on a player reads together. A failed bid whose winner isn't in this group (or can't be
// identified, e.g. a full roster) keeps its place in time order.
function nestLostBids(rows: Transaction[]): { txn: Transaction; nested: boolean }[] {
  const ids = new Set(rows.map((txn) => txn.id))
  const isNested = (txn: Transaction) =>
    txn.winner_transaction_id !== null && ids.has(txn.winner_transaction_id)

  const lostBy = new Map<string, Transaction[]>()
  for (const txn of rows) {
    if (!isNested(txn)) continue
    const group = lostBy.get(txn.winner_transaction_id as string) ?? []
    group.push(txn)
    lostBy.set(txn.winner_transaction_id as string, group)
  }

  const ordered: { txn: Transaction; nested: boolean }[] = []
  for (const txn of rows) {
    if (isNested(txn)) continue
    ordered.push({ txn, nested: false })
    for (const lost of (lostBy.get(txn.id) ?? []).sort((a, b) => b.bid_amount - a.bid_amount)) {
      ordered.push({ txn: lost, nested: true })
    }
  }
  return ordered
}

// A team's view of the wire: its own claims and pickups, trades it was part of, and bids that lost
// to it (so a team's winning claim still shows who it beat).
function involvesTeam(txn: Transaction, teamId: number): boolean {
  if (txn.espn_team_id === teamId || txn.winner_espn_team_id === teamId) return true
  return txn.items.some(
    (item) => item.from_espn_team_id === teamId || item.to_espn_team_id === teamId
  )
}

export default function TransactionsBrowser({
  transactions,
  seasons,
  season,
  defaultSeason,
  teams,
  teamNameByKey,
  teamLogoByKey,
  initialWeek,
  initialTeam,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [pending, setPending] = useState<{
    season: number
    week: number | 'all' | null
    team: number | null
  } | null>(null)

  const weeks = useMemo(
    () => [...new Set(transactions.map((txn) => txn.week_number))].sort((a, b) => a - b),
    [transactions]
  )
  // Default to the latest week with activity, not "all" -- the wire is mostly "what just
  // happened", and a full season is one click away.
  const defaultWeek: number | 'all' | null = weeks[weeks.length - 1] ?? null
  const resolvedWeek =
    initialWeek === 'all' || (typeof initialWeek === 'number' && weeks.includes(initialWeek))
      ? initialWeek
      : defaultWeek
  const resolvedTeam =
    initialTeam !== null && teams.some((team) => team.espnTeamId === initialTeam)
      ? initialTeam
      : null

  // A week or team change filters rows already on the client, so it can render instantly instead
  // of waiting out the (force-dynamic) server round trip. A season change genuinely needs the
  // server's rows, so the old rows stay (dimmed) until the new season arrives.
  const switchingSeason = isPending && pending !== null && pending.season !== season
  const optimistic = isPending && pending !== null && !switchingSeason ? pending : null
  const week = optimistic ? (optimistic.week ?? defaultWeek) : resolvedWeek
  const team = optimistic ? optimistic.team : resolvedTeam
  const shownSeason = isPending && pending ? pending.season : season

  const navigate = (next: {
    season?: number
    week?: number | 'all' | null
    team?: number | null
  }) => {
    const nextSeason = next.season ?? season
    // A season change drops the week (each season has its own weeks); the team carries over.
    const nextWeek = next.season !== undefined ? null : 'week' in next ? next.week : week
    const nextTeam = 'team' in next ? next.team : team
    setPending({ season: nextSeason as number, week: nextWeek ?? null, team: nextTeam ?? null })
    const params = new URLSearchParams()
    if (nextSeason !== defaultSeason) params.set('season', String(nextSeason))
    if (nextWeek !== null && nextWeek !== undefined) params.set('week', String(nextWeek))
    if (nextTeam !== null && nextTeam !== undefined) params.set('team', String(nextTeam))
    const query = params.toString()
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  // Newest first by when it actually happened, grouped under ET day headings.
  const days = useMemo(() => {
    const visible = transactions.filter(
      (txn) =>
        (week === 'all' || txn.week_number === week) && (team === null || involvesTeam(txn, team))
    )
    const sorted = [...visible].sort(
      (a, b) =>
        Date.parse(b.processed_at ?? b.proposed_at) - Date.parse(a.processed_at ?? a.proposed_at)
    )
    const groups: { key: string; label: string; rows: Transaction[] }[] = []
    for (const txn of sorted) {
      const date = new Date(txn.processed_at ?? txn.proposed_at)
      const key = DAY_KEY_FORMAT.format(date)
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.rows.push(txn)
      else groups.push({ key, label: DAY_FORMAT.format(date), rows: [txn] })
    }
    return groups.map((group) => ({ ...group, rows: nestLostBids(group.rows) }))
  }, [transactions, week, team])

  if (seasons.length === 0 || season === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No transactions synced yet — a commissioner needs to run an ESPN refresh first.
      </p>
    )
  }

  // Equal bids are settled by waiver priority, not by price, so "outbid" would be wrong there.
  const winnerPhrase = (lost: Transaction) => {
    const winner = transactions.find((txn) => txn.id === lost.winner_transaction_id)
    if (winner && winner.bid_amount === lost.bid_amount)
      return 'lost the waiver-priority tiebreak to'
    return 'outbid by'
  }

  const teamName = (seasonYear: number, espnTeamId: number) =>
    teamNameByKey[teamKey(seasonYear, espnTeamId)] ?? `Team ${espnTeamId}`

  const selectClasses = `rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-ink dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${focusRingClasses}`

  const pillClasses = (selected: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium transition-colors ${focusRingClasses} ${
      selected
        ? 'bg-primary-500 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
    }`

  // The teams a row is about: both sides of a trade, otherwise the one that acted.
  const rowTeams = (txn: Transaction): number[] => {
    if (txn.kind !== 'TRADE') return [txn.espn_team_id]
    const ids: number[] = []
    for (const item of txn.items) {
      for (const id of [item.from_espn_team_id, item.to_espn_team_id]) {
        if (id !== 0 && !ids.includes(id)) ids.push(id)
      }
    }
    return ids.length > 0 ? ids : [txn.espn_team_id]
  }

  const renderSummary = (txn: Transaction): string[] => {
    const added = txn.items.filter((item) => item.action === 'ADD')
    const dropped = txn.items.filter((item) => item.action === 'DROP')
    const droppedNote =
      dropped.length > 0 ? `, dropped ${dropped.map(describePlayer).join(', ')}` : ''

    if (txn.kind === 'TRADE') {
      // One line per team: what it sent (players, and FAAB budget if it gave any), plus any
      // forced drop it had to make afterward.
      return rowTeams(txn).map((teamId) => {
        const sent = txn.items
          .filter((item) => item.action === 'TRADE' && item.from_espn_team_id === teamId)
          .map(describePlayer)
        if (txn.items.some((item) => item.action === 'FAAB' && item.from_espn_team_id === teamId)) {
          sent.push('FAAB budget')
        }
        const drops = dropped
          .filter((item) => item.from_espn_team_id === teamId)
          .map(describePlayer)
        const dropNote = drops.length > 0 ? `, then dropped ${drops.join(', ')}` : ''
        return `${teamName(txn.season_year, teamId)} sent ${sent.length > 0 ? sent.join(', ') : 'nothing'}${dropNote}`
      })
    }
    if (txn.status === 'EXECUTED') {
      const bid = txn.kind === 'WAIVER' ? ` for ${formatBid(txn.bid_amount)}` : ''
      return [`Added ${added.map(describePlayer).join(', ')}${bid}${droppedNote}`]
    }
    const reason =
      txn.winner_espn_team_id !== null
        ? `${winnerPhrase(txn)} ${teamName(txn.season_year, txn.winner_espn_team_id)}`
        : (FAILURE_REASONS[txn.status] ??
          (txn.status === 'FAILED_INVALIDPLAYERSOURCE'
            ? 'player already claimed'
            : 'did not go through'))
    return [
      `Bid ${formatBid(txn.bid_amount)} on ${added.map(describePlayer).join(', ')} failed — ${reason}`,
    ]
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {seasons.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Season
            <select
              value={shownSeason ?? ''}
              onChange={(e) => navigate({ season: Number(e.target.value) })}
              className={selectClasses}
            >
              {seasons.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        )}
        {teams.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Team
            <select
              value={team ?? ''}
              onChange={(e) =>
                navigate({ team: e.target.value === '' ? null : Number(e.target.value) })
              }
              className={selectClasses}
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.espnTeamId} value={t.espnTeamId}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="flex flex-wrap gap-2" aria-label="Select week">
          {weeks.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => navigate({ week: w })}
              className={pillClasses(w === week)}
            >
              {w}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate({ week: 'all' })}
            className={pillClasses(week === 'all')}
          >
            All weeks
          </button>
        </nav>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {team !== null
            ? 'No transactions for this team in this week.'
            : 'No transactions this week.'}
        </p>
      ) : (
        <div className={`space-y-8 transition-opacity ${switchingSeason ? 'opacity-50' : ''}`}>
          {days.map((day) => (
            <section key={day.key}>
              <h2 className="mb-3 text-lg font-semibold text-ink dark:text-gray-100">
                {day.label}
              </h2>
              <ul className="divide-y divide-gray-200 rounded-card border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                {day.rows.map(({ txn, nested }) => {
                  const failed = txn.status !== 'EXECUTED'
                  return (
                    <li
                      key={txn.id}
                      className={`flex items-start gap-3 py-3 pr-4 ${
                        nested ? 'bg-gray-50 pl-12 dark:bg-gray-800/40' : 'pl-4'
                      }`}
                    >
                      <div className="flex shrink-0 -space-x-1 pt-0.5">
                        {rowTeams(txn).map((teamId) => (
                          <TeamLogo
                            key={teamId}
                            src={teamLogoByKey[teamKey(txn.season_year, teamId)] ?? null}
                          />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink dark:text-gray-100">
                          {rowTeams(txn)
                            .map((teamId) => teamName(txn.season_year, teamId))
                            .join(' ⇄ ')}
                          {txn.kind === 'TRADE' && (
                            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              Trade
                            </span>
                          )}
                        </p>
                        {renderSummary(txn).map((line) => (
                          <p
                            key={line}
                            className={`text-sm ${
                              failed
                                ? 'text-gray-500 dark:text-gray-500'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
