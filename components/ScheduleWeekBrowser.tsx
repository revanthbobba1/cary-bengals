'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import MatchupList from './MatchupList'
import { focusRingClasses } from '@/lib/focusRing'
import type { Matchup } from '@/lib/types/matchup'

// Scores only actually change via the ~10-minute live-game cron sync (see
// docs/ESPN_INTEGRATION_PLAN.md's Phase 8c-cron notes), so polling faster than that can't surface
// anything newer -- this cadence is about not making someone sit on a stale page for minutes
// without any prompt, not about matching the sync's own frequency.
const POLL_INTERVAL_MS = 60_000

interface Props {
  matchups: Matchup[]
  teamNameById: Record<string, string>
  currentWeek: number | null
  // Already-validated from the page's `?week=` searchParam (null if absent/invalid) -- lets the
  // very first server-rendered HTML land on the right week with no flash, same as ArticlesList's
  // `season` prop.
  initialWeek: number | null
}

export default function ScheduleWeekBrowser({
  matchups,
  teamNameById,
  currentWeek,
  initialWeek,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [pendingWeek, setPendingWeek] = useState<number | null>(null)

  const matchupsByWeek = useMemo(() => {
    const byWeek = new Map<number, Matchup[]>()
    for (const matchup of matchups) {
      const group = byWeek.get(matchup.week_number) ?? []
      group.push(matchup)
      byWeek.set(matchup.week_number, group)
    }
    return byWeek
  }, [matchups])

  const weeks = useMemo(
    () => Array.from(matchupsByWeek.keys()).sort((a, b) => a - b),
    [matchupsByWeek]
  )

  // The default week when nothing specific is requested: the current week, but only if it
  // actually has synced matchups. espn_schedule_state.current_week is deliberately persisted even
  // when that week's own matchup payload came back empty (e.g. every matchup that week referenced
  // an unpaired team -- see lib/espn/matchupSync.ts), so trusting it blindly here could land on an
  // empty page while real data for an earlier week sits one click away.
  const defaultWeek =
    currentWeek !== null && weeks.includes(currentWeek)
      ? currentWeek
      : (weeks[weeks.length - 1] ?? null)

  const resolvedWeek =
    initialWeek !== null && weeks.includes(initialWeek) ? initialWeek : defaultWeek

  // Same optimistic-render reasoning as ArticlesList's season pills: every week's matchups for the
  // season are already on the client (at most ~84 rows), so a pill click can render instantly
  // instead of waiting out a force-dynamic server round trip. See that component's own comment for
  // why the gate is `isPending`, not `pendingWeek !== resolvedWeek`.
  const selectedWeek = isPending && pendingWeek !== null ? pendingWeek : resolvedWeek

  const selectWeek = (week: number) => {
    setPendingWeek(week)
    startTransition(() => {
      router.replace(week === defaultWeek ? pathname : `${pathname}?week=${week}`, {
        scroll: false,
      })
    })
  }

  // Polls only while viewing the live week -- a past (final) or future (not yet started) week's
  // data can't change, so polling it would just be wasted reads. Also refreshes immediately when
  // the tab regains focus/visibility, not just on the next interval tick, so returning to an idle
  // tab doesn't leave someone looking at scores that are already up to a minute stale.
  useEffect(() => {
    if (selectedWeek === null || selectedWeek !== currentWeek) return

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }

    const interval = setInterval(refreshIfVisible, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [selectedWeek, currentWeek, router])

  if (weeks.length === 0 || selectedWeek === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No matchups synced yet — a commissioner needs to run an ESPN refresh first.
      </p>
    )
  }

  return (
    <>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Select week">
        {weeks.map((week) => {
          const isSelected = week === selectedWeek
          const isCurrent = week === currentWeek
          return (
            <button
              key={week}
              type="button"
              onClick={() => selectWeek(week)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${focusRingClasses} ${
                isSelected
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              } ${isCurrent && !isSelected ? 'ring-2 ring-inset ring-primary-500' : ''}`}
            >
              {week}
            </button>
          )
        })}
      </nav>
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-ink dark:text-gray-100">
          Week {selectedWeek}
          {selectedWeek === currentWeek && (
            <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Current
            </span>
          )}
        </h2>
        <MatchupList
          matchups={matchupsByWeek.get(selectedWeek) ?? []}
          teamNameById={teamNameById}
          allowExpand
        />
      </section>
    </>
  )
}
