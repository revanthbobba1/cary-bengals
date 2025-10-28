'use client'
import React, { useState, useMemo } from 'react'
import { pollData } from '../data/pollData'

const getTrendColor = (trend: string) => {
  if (trend.startsWith('↑')) return 'text-green-500'
  if (trend.startsWith('↓')) return 'text-red-500'
  return 'text-gray-500'
}

export default function CommissionerPollClient() {
  const availableYears = useMemo(
    () =>
      Object.keys(pollData)
        .map(Number)
        .sort((a, b) => b - a),
    []
  )
  const mostRecentYear = useMemo(() => Math.max(...availableYears), [availableYears])

  const getAvailableWeeks = (year: number) => {
    const weeks = Object.keys(pollData[year] || {})
      .map(Number)
      .sort((a, b) => b - a)
    return weeks
  }

  const getMostRecentWeek = (year: number) => {
    const weeks = getAvailableWeeks(year)
    return weeks.length > 0 ? weeks[0] : 1
  }

  const [selectedYear, setSelectedYear] = useState(mostRecentYear)
  const [selectedWeek, setSelectedWeek] = useState(getMostRecentWeek(mostRecentYear))

  const handleYearChange = (newYear: number) => {
    setSelectedYear(newYear)
    setSelectedWeek(getMostRecentWeek(newYear))
  }

  const currentData = pollData[selectedYear]?.[selectedWeek] || []
  const availableWeeksForYear = getAvailableWeeks(selectedYear)

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Cary Bengals Commissioner's Poll
        </h2>
        <div className="flex gap-4">
          <div>
            <label htmlFor="year-select" className="text-gray-600 dark:text-gray-300 mr-2">
              Select Year:
            </label>
            <select
              id="year-select"
              className="border border-gray-300 dark:border-gray-600 rounded p-2 pr-10 bg-white dark:bg-gray-700 dark:text-gray-100 appearance-none"
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
              className="border border-gray-300 dark:border-gray-600 rounded p-2 pr-10 bg-white dark:bg-gray-700 dark:text-gray-100 appearance-none"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>\")",
                backgroundPosition: 'right 10px center',
                backgroundRepeat: 'no-repeat',
              }}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
            >
              {availableWeeksForYear.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
          {currentData.length > 0 ? (
            currentData.map((team) => (
              <tr key={team.rank} className="border-t border-gray-200 dark:border-gray-700">
                <td className="py-2 font-semibold">{team.rank}</td>
                <td>{team.team}</td>
                <td>{team.record}</td>
                <td>{team.points}</td>
                <td className={`font-semibold ${getTrendColor(team.trend)}`}>{team.trend}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                No data available for this selection
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
