'use client'

import { useRouter } from 'next/navigation'
import { focusRingClasses } from '@/lib/focusRing'

// Season picker for /history; navigates with `?season=` so the server renders the chosen season.
export default function SeasonSelect({ seasons, season }: { seasons: number[]; season: number }) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      Season
      <select
        value={season}
        onChange={(e) => router.push(`/history?tab=seasons&season=${e.target.value}`)}
        className={`rounded border border-gray-300 bg-white px-2 py-1 text-ink dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${focusRingClasses}`}
      >
        {seasons.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  )
}
