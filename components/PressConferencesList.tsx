'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PressConferenceCard from './PressConferenceCard'
import type { PressConference } from '@/lib/types/pressConference'

const selectClasses =
  'appearance-none rounded-control border border-gray-200 bg-white py-2 pl-4 pr-10 text-sm font-semibold text-gray-700 shadow-card transition-shadow duration-150 ease-out-expo hover:border-gray-300 focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-gray-600'

export default function PressConferencesList({
  conferences,
  season,
}: {
  conferences: PressConference[]
  season: number
}) {
  const seasons = useMemo(
    () => [...new Set(conferences.map((c) => c.season_year))].sort((a, b) => b - a),
    [conferences]
  )
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [pendingSeason, setPendingSeason] = useState<number | null>(null)

  // Same reasoning as components/articles/ArticlesList.tsx's identical resolvedSeason/selectSeason
  // pair: the season lives in the URL (not component state) so a filtered view is linkable and
  // survives Back, falling back to the newest season rather than an empty grid for a bad/stale
  // value; the optimistic pendingSeason keeps the dropdown feeling instant across the
  // force-dynamic round-trip this page already takes (see app/conferences/page.tsx).
  const resolvedSeason = seasons.includes(season) ? season : seasons[0]
  const selectedSeason = isPending && pendingSeason !== null ? pendingSeason : resolvedSeason

  const selectSeason = (year: number) => {
    setPendingSeason(year)
    startTransition(() => {
      router.replace(year === seasons[0] ? pathname : `${pathname}?season=${year}`, {
        scroll: false,
      })
    })
  }

  const conferencesForSelectedSeason = conferences
    .filter((c) => c.season_year === selectedSeason)
    .sort((a, b) => b.week_number - a.week_number)

  if (conferences.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400">
        No press conferences yet -- check back soon.
      </p>
    )
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
          {selectedSeason}
        </h2>
        {seasons.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            Season
            <select
              value={selectedSeason}
              onChange={(e) => selectSeason(Number(e.target.value))}
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
      </div>
      <div className="-m-4 flex flex-wrap">
        {conferencesForSelectedSeason.map((conference) => (
          <PressConferenceCard key={conference.id} conference={conference} />
        ))}
      </div>
    </>
  )
}
