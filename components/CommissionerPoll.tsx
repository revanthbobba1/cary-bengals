'use client'
import React, { useState, useMemo } from 'react'

interface TeamData {
  rank: number
  team: string
  record: string
  points: number
  trend: string
}

interface PollData {
  [year: number]: {
    [week: number]: TeamData[]
  }
}

const pollData: PollData = {
  2024: {
    1: [
      { rank: 1, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-0', points: 6, trend: '-' },
      { rank: 2, team: 'My Puka Bear (Alvin)', record: '1-0', points: 16, trend: '-' },
      { rank: 3, team: 'JamesOn (Cotbib)', record: '1-0', points: 18, trend: '-' },
      { rank: 4, team: 'I Cook Brown Rice (Revanth)', record: '1-0', points: 19, trend: '-' },
      { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '1-0', points: 28, trend: '-' },
      { rank: 6, team: 'JJ Phoenix Rising (Kirk)', record: '1-0', points: 31, trend: '-' },
      { rank: 7, team: "Scary Terry's Turbulators (Joseph)", record: '0-1', points: 33, trend: '-' },
      { rank: 8, team: 'Chasing an Identity (TJ)', record: '0-1', points: 36, trend: '-' },
      { rank: 9, team: "Ladd's Lads (Keshav)", record: '0-1', points: 44, trend: '-' },
      { rank: 10, team: 'Christian Crusaders (Sam)', record: '0-1', points: 49, trend: '-' },
      { rank: 11, team: "Super Zay'in (Amogh)", record: '0-1', points: 53, trend: '-' },
      { rank: 12, team: 'London is Red (Rishi)', record: '0-1', points: 57, trend: '-' },
    ],
    2: [
      { rank: 1, team: 'JamesOn (Cotbib)', record: '2-0', points: 9, trend: '↑2' },
      { rank: 2, team: 'I Cook Brown Rice (Revanth)', record: '2-0', points: 10, trend: '↑2' },
      { rank: 3, team: 'My Puka Bear (Alvin)', record: '2-0', points: 11, trend: '↓1' },
      { rank: 4, team: "Super Zay'in (Amogh)", record: '1-1', points: 15, trend: '↑7' },
      { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '2-0', points: 19, trend: '-' },
      { rank: 6, team: 'Chasing an Identity (TJ)', record: '1-1', points: 20, trend: '↑2' },
      { rank: 7, team: "Scary Terry's Turbulators (Joseph)", record: '1-1', points: 31, trend: '-' },
      { rank: 8, team: 'JJ Phoenix Rising (Kirk)', record: '1-1', points: 34, trend: '↓2' },
      { rank: 9, team: 'London is Red (Rishi)', record: '0-2', points: 35, trend: '↑3' },
      { rank: 10, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-1', points: 38, trend: '↓9' },
      { rank: 11, team: "Ladd's Lads (Keshav)", record: '0-2', points: 42, trend: '↓2' },
      { rank: 12, team: 'Christian Crusaders (Sam)', record: '0-2', points: 48, trend: '↓2' },
    ],
  },
  2025: {
    1: [
      { rank: 1, team: 'New Champion (Example)', record: '1-0', points: 8, trend: '-' },
      { rank: 2, team: 'Rising Star (Example)', record: '1-0', points: 12, trend: '-' },
      { rank: 3, team: 'Elite Squad (Example)', record: '1-0', points: 15, trend: '-' },
      { rank: 4, team: 'Thunder Bolts (Example)', record: '1-0', points: 18, trend: '-' },
      { rank: 5, team: 'Dynasty Builders (Example)', record: '1-0', points: 22, trend: '-' },
      { rank: 6, team: 'Victory Lane (Example)', record: '1-0', points: 25, trend: '-' },
      { rank: 7, team: 'Power Rangers (Example)', record: '0-1', points: 28, trend: '-' },
      { rank: 8, team: 'Dream Team (Example)', record: '0-1', points: 32, trend: '-' },
      { rank: 9, team: 'Iron Will (Example)', record: '0-1', points: 35, trend: '-' },
      { rank: 10, team: 'Legacy Builders (Example)', record: '0-1', points: 40, trend: '-' },
      { rank: 11, team: 'Future Stars (Example)', record: '0-1', points: 45, trend: '-' },
      { rank: 12, team: 'Rebels (Example)', record: '0-1', points: 50, trend: '-' },
    ],
  },
}

const getTrendColor = (trend: string) => {
  if (trend.startsWith('↑')) return 'text-green-500'
  if (trend.startsWith('↓')) return 'text-red-500'
  return 'text-gray-500'
}

export default function CoachesPollClient(): JSX.Element {
  // Get available years and weeks
  const availableYears = useMemo(() => Object.keys(pollData).map(Number).sort((a, b) => b - a), [])
  
  // Get the most recent year (highest number)
  const mostRecentYear = useMemo(() => Math.max(...availableYears), [availableYears])
  
  // Get available weeks for a given year
  const getAvailableWeeks = (year: number) => {
    const weeks = Object.keys(pollData[year] || {}).map(Number).sort((a, b) => b - a)
    return weeks
  }
  
  // Get the most recent week for a given year
  const getMostRecentWeek = (year: number) => {
    const weeks = getAvailableWeeks(year)
    return weeks.length > 0 ? weeks[0] : 1
  }
  
  // Initialize state with most recent year and week
  const getInitialYear = () => mostRecentYear
  const getInitialWeek = (year: number) => getMostRecentWeek(year)
  
  const [selectedYear, setSelectedYear] = useState<number>(getInitialYear())
  const [selectedWeek, setSelectedWeek] = useState<number>(getInitialWeek(getInitialYear()))

  // Handle year change
  const handleYearChange = (newYear: number) => {
    setSelectedYear(newYear)
    // Reset to the most recent week of the selected year
    const week = getMostRecentWeek(newYear)
    setSelectedWeek(week)
  }

  // Get current data
  const currentData = pollData[selectedYear]?.[selectedWeek] || []
  const availableWeeksForYear = getAvailableWeeks(selectedYear)

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Bengals Managers Poll
        </h2>
        <div className="flex gap-4">
          {/* Year Selector */}
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

          {/* Week Selector */}
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
