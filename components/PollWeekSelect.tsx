'use client'

import { useRouter } from 'next/navigation'
import { focusRingClasses } from '@/lib/focusRing'

interface Props {
  weeks: Array<{ id: string; season_year: number; week_number: number }>
  selectedId: string
}

export default function PollWeekSelect({ weeks, selectedId }: Props) {
  const router = useRouter()

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      Week
      <select
        value={selectedId}
        onChange={(e) =>
          router.push(`/admin/commissioner?section=poll&week=${e.target.value}`, { scroll: false })
        }
        className={`rounded-control border border-gray-300 bg-white px-3 py-1.5 text-sm text-ink dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${focusRingClasses}`}
      >
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            {w.season_year} Week {w.week_number}
          </option>
        ))}
      </select>
    </label>
  )
}
