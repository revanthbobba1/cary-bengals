'use client'
import React, { useState } from 'react'

const pollData = {
  week1: [
    { rank: 1, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-0', points: 6, trend: '-' },
    { rank: 2, team: 'My Puka Bear (Alvin)', record: '1-0', points: 16, trend: '-' },
    { rank: 3, team: 'JamesOn (Cotbib)', record: '1-0', points: 18, trend: '-' },
    { rank: 4, team: 'I Cook Brown Rice (Revanth)', record: '1-0', points: 19, trend: '-' },
    { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '1-0', points: 28, trend: '-' },
    { rank: 6, team: 'JJ Phoenix Rising (Kirk)', record: '1-0', points: 31, trend: '-' },
    { rank: 7, team: 'Scary Terry’s Turbulators (Joseph)', record: '0-1', points: 33, trend: '-' },
    { rank: 8, team: 'Chasing an Identity (TJ)', record: '0-1', points: 36, trend: '-' },
    { rank: 9, team: 'Ladd’s Lads (Keshav)', record: '0-1', points: 44, trend: '-' },
    { rank: 10, team: 'Christian Crusaders (Sam)', record: '0-1', points: 49, trend: '-' },
    { rank: 11, team: 'Super Zay’in (Amogh)', record: '0-1', points: 53, trend: '-' },
    { rank: 12, team: 'London is Red (Rishi)', record: '0-1', points: 57, trend: '-' },
  ],
  week2: [
    { rank: 1, team: 'JamesOn (Cotbib)', record: '2-0', points: 9, trend: '↑2' },
    { rank: 2, team: 'I Cook Brown Rice (Revanth)', record: '2-0', points: 10, trend: '↑2' },
    { rank: 3, team: 'My Puka Bear (Alvin)', record: '2-0', points: 11, trend: '↓1' },
    { rank: 4, team: 'Super Zay’in (Amogh)', record: '1-1', points: 15, trend: '↑7' },
    { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '2-0', points: 19, trend: '-' },
    { rank: 6, team: 'Chasing an Identity (TJ)', record: '1-1', points: 20, trend: '↑2' },
    { rank: 7, team: 'Scary Terry’s Turbulators (Joseph)', record: '1-1', points: 31, trend: '-' },
    { rank: 8, team: 'JJ Phoenix Rising (Kirk)', record: '1-1', points: 34, trend: '↓2' },
    { rank: 9, team: 'London is Red (Rishi)', record: '0-2', points: 35, trend: '↑3' },
    { rank: 10, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-1', points: 38, trend: '↓9' },
    { rank: 11, team: 'Ladd’s Lads (Keshav)', record: '0-2', points: 42, trend: '↓2' },
    { rank: 12, team: 'Christian Crusaders (Sam)', record: '0-2', points: 48, trend: '↓2' },
  ],
}

const getTrendColor = (trend: string) => {
  if (trend.startsWith('↑')) return 'text-green-500'
  if (trend.startsWith('↓')) return 'text-red-500'
  return 'text-gray-500'
}

export default function CoachesPollClient(): JSX.Element {
  const [selectedWeek, setSelectedWeek] = useState('week2')

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Bengals Managers Poll
        </h2>
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
            onChange={(e) => setSelectedWeek(e.target.value)}
          >
            <option value="week1">Week 1</option>
            <option value="week2">Week 2</option>
          </select>
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
          {pollData[selectedWeek].map((team) => (
            <tr key={team.rank} className="border-t border-gray-200 dark:border-gray-700">
              <td className="py-2 font-semibold">{team.rank}</td>
              <td>{team.team}</td>
              <td>{team.record}</td>
              <td>{team.points}</td>
              <td className={`font-semibold ${getTrendColor(team.trend)}`}>{team.trend}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
