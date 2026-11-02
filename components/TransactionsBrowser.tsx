'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import TeamLogo from './TeamLogo'
import { focusRingClasses } from '@/lib/focusRing'
import { teamKey, type Transaction, type TransactionItem } from '@/lib/types/transaction'

interface Props {
  transactions: Transaction[]
  teamNameByKey: Record<string, string>
  teamLogoByKey: Record<string, string | null>
  currentSeason: number
  // Already-validated from the page's `?season=` / `?week=` params (null if absent/invalid).
  // `initialWeek` of 'all' means the whole season.
  initialSeason: number | null
  initialWeek: number | 'all' | null
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

export default function TransactionsBrowser({
  transactions,
  teamNameByKey,
  teamLogoByKey,
  currentSeason,
  initialSeason,
  initialWeek,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [pending, setPending] = useState<{ season: number; week: number | 'all' | null } | null>(
    null
  )

  const seasons = useMemo(
    () => [...new Set(transactions.map((txn) => txn.season_year))].sort((a, b) => b - a),
    [transactions]
  )
  const defaultSeason = seasons.includes(currentSeason) ? currentSeason : (seasons[0] ?? null)
  const resolvedSeason =
    initialSeason !== null && seasons.includes(initialSeason) ? initialSeason : defaultSeason

  const season = isPending && pending ? pending.season : resolvedSeason
  const seasonTransactions = useMemo(
    () => transactions.filter((txn) => txn.season_year === season),
    [transactions, season]
  )
  const weeks = useMemo(
    () => [...new Set(seasonTransactions.map((txn) => txn.week_number))].sort((a, b) => a - b),
    [seasonTransactions]
  )
  // Default to the latest week with activity, not "all" -- the wire is mostly "what just
  // happened", and a full season is one click away.
  const defaultWeek: number | 'all' | null = weeks[weeks.length - 1] ?? null
  const resolvedWeek =
    initialWeek === 'all' || (typeof initialWeek === 'number' && weeks.includes(initialWeek))
      ? initialWeek
      : defaultWeek
  // A season change resets to that season's default week (pending.week is null then).
  const week = isPending && pending ? (pending.week ?? defaultWeek) : resolvedWeek

  const navigate = (nextSeason: number, nextWeek: number | 'all' | null) => {
    setPending({ season: nextSeason, week: nextWeek })
    const params = new URLSearchParams()
    if (nextSeason !== defaultSeason) params.set('season', String(nextSeason))
    if (nextWeek !== null) params.set('week', String(nextWeek))
    const query = params.toString()
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  // Newest first by when it actually happened, grouped under ET day headings.
  const days = useMemo(() => {
    const visible = seasonTransactions.filter((txn) => week === 'all' || txn.week_number === week)
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
  }, [seasonTransactions, week])

  if (seasons.length === 0 || season === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No transactions synced yet — a commissioner needs to run an ESPN refresh first.
      </p>
    )
  }

  // Equal bids are settled by waiver priority, not by price, so "outbid" would be wrong there.
  const winnerPhrase = (lost: Transaction) => {
    const winner = seasonTransactions.find((txn) => txn.id === lost.winner_transaction_id)
    if (winner && winner.bid_amount === lost.bid_amount)
      return 'lost the waiver-priority tiebreak to'
    return 'outbid by'
  }

  const teamName = (seasonYear: number, espnTeamId: number) =>
    teamNameByKey[teamKey(seasonYear, espnTeamId)] ?? `Team ${espnTeamId}`

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
              value={season}
              onChange={(e) => navigate(Number(e.target.value), null)}
              className={`rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-ink dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${focusRingClasses}`}
            >
              {seasons.map((year) => (
                <option key={year} value={year}>
                  {year}
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
              onClick={() => navigate(season, w)}
              className={pillClasses(w === week)}
            >
              {w}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate(season, 'all')}
            className={pillClasses(week === 'all')}
          >
            All weeks
          </button>
        </nav>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">No transactions this week.</p>
      ) : (
        <div className="space-y-8">
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
