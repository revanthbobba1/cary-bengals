'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PollResultWithTeam } from '@/lib/types/poll'

interface Props {
  availableYears: number[]
  weeksByYear: Record<number, number[]>
  defaultYear: number
  defaultWeek: number
  defaultResults: PollResultWithTeam[]
}

const getTrendColor = (trend: string) => {
  if (trend.startsWith('↑')) return 'text-green-500'
  if (trend.startsWith('↓')) return 'text-red-500'
  return 'text-gray-500'
}

// Matches the real table's column shape so the swap from skeleton to data doesn't shift layout.
// 12 rows since that's the league's team count (see PollSubmissionForm's 12/12 submission check).
function PollTableSkeleton() {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-600 dark:text-gray-300">
          <th className="py-2">Rank</th>
          <th>Team</th>
          <th>Record</th>
          <th>Rank Score</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 12 }).map((_, i) => (
          <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
            <td className="py-2">
              <div className="h-4 w-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </td>
            <td>
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </td>
            <td>
              <div className="h-4 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </td>
            <td>
              <div className="h-4 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </td>
            <td>
              <div className="h-4 w-6 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function CommissionerPollClient({
  availableYears,
  weeksByYear,
  defaultYear,
  defaultWeek,
  defaultResults,
}: Props) {
  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek)
  const [results, setResults] = useState(defaultResults)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  const availableWeeks = useMemo(() => weeksByYear[selectedYear] || [], [selectedYear, weeksByYear])

  const fetchResults = async (year: number, week: number) => {
    setLoading(true)

    const { data: pollWeek } = await supabase
      .from('poll_weeks')
      .select('id')
      .eq('season_year', year)
      .eq('week_number', week)
      .single()

    if (!pollWeek) {
      setResults([])
      setLoading(false)
      return
    }

    const { data: fetchedResults } = await supabase
      .from('poll_results')
      .select(
        `
        *,
        team:teams(*)
      `
      )
      .eq('poll_week_id', pollWeek.id)
      .order('final_rank')

    setResults((fetchedResults as PollResultWithTeam[]) || [])
    setLoading(false)
  }

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    const newWeek = weeksByYear[year][0]
    setSelectedWeek(newWeek)
    fetchResults(year, newWeek)
  }

  const handleWeekChange = (week: number) => {
    setSelectedWeek(week)
    fetchResults(selectedYear, week)
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-ink dark:text-gray-100">
          Cary Bengals Commissioner&apos;s Poll
        </h2>
        <div className="flex gap-4">
          <div>
            <label htmlFor="year-select" className="text-gray-600 dark:text-gray-300 mr-2">
              Select Year:
            </label>
            <select
              id="year-select"
              className="rounded-control border border-gray-200 bg-white p-2 pr-10 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo appearance-none focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>\")",
                backgroundPosition: 'right 10px center',
                backgroundRepeat: 'no-repeat',
              }}
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="week-select" className="text-gray-600 dark:text-gray-300 mr-2">
              Select Week:
            </label>
            <select
              id="week-select"
              className="rounded-control border border-gray-200 bg-white p-2 pr-10 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo appearance-none focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>\")",
                backgroundPosition: 'right 10px center',
                backgroundRepeat: 'no-repeat',
              }}
              value={selectedWeek}
              onChange={(e) => handleWeekChange(Number(e.target.value))}
            >
              {availableWeeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <PollTableSkeleton />
      ) : results.length === 0 ? (
        <div className="text-center py-8">No poll data for this week</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-300">
              <th className="py-2">Rank</th>
              <th>Team</th>
              <th>Record</th>
              <th>Rank Score</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.id}
                className="border-t border-gray-100 transition-colors duration-150 ease-out-expo hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
              >
                <td className="py-2 font-semibold text-ink dark:text-gray-100">
                  {result.final_rank}
                </td>
                <td className="font-medium text-ink dark:text-gray-100">{result.team.name}</td>
                <td>{result.team_record || '-'}</td>
                <td>{result.avg_rank_score.toFixed(2)}</td>
                <td className={`font-semibold ${getTrendColor(result.trend)}`}>{result.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
