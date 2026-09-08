'use client'

import { useState } from 'react'
import type { Article } from '@/lib/types/article'
import { getDisplayName } from '@/lib/displayName'

interface LeagueMember {
  id: string
  email: string
  full_name: string | null
}

interface Props {
  articles: Article[]
  /** Commissioner view: shows every article with an assignee column. Member view: just their own. */
  members?: LeagueMember[]
}

const statusBadgeClasses: Record<Article['status'], string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  published: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
}

export default function ArticlesList({ articles, members }: Props) {
  const showAssignee = Array.isArray(members)
  const membersById = new Map((members ?? []).map((m) => [m.id, m]))

  const availableYears = [...new Set(articles.map((a) => a.season_year))].sort((a, b) => b - a)
  const [selectedYear, setSelectedYear] = useState(availableYears[0] ?? new Date().getFullYear())

  const articlesForSelectedYear = articles
    .filter((a) => a.season_year === selectedYear)
    // Drafts pinned to the top -- this list doubles as the duty roster of who owes what.
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'draft' ? -1 : 1
      return b.week_number - a.week_number
    })

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink dark:text-gray-100">
          {showAssignee ? 'All Articles' : 'Your Articles'}
        </h2>
        {availableYears.length > 1 && (
          <div>
            <label
              htmlFor="articles-year-select"
              className="text-sm text-gray-600 dark:text-gray-300 mr-2"
            >
              Season:
            </label>
            <select
              id="articles-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left p-2">Week</th>
              <th className="text-left p-2">Kind</th>
              <th className="text-left p-2">Status</th>
              {showAssignee && <th className="text-left p-2">Assigned To</th>}
            </tr>
          </thead>
          <tbody>
            {articlesForSelectedYear.length === 0 && (
              <tr>
                <td
                  colSpan={showAssignee ? 4 : 3}
                  className="p-2 text-center text-gray-500 dark:text-gray-400"
                >
                  {showAssignee
                    ? `No articles for ${selectedYear}.`
                    : 'No articles assigned to you yet.'}
                </td>
              </tr>
            )}
            {articlesForSelectedYear.map((article) => {
              const assignee = article.author_id ? membersById.get(article.author_id) : undefined
              return (
                <tr
                  key={article.id}
                  className="border-b border-gray-100 last:border-none dark:border-gray-800"
                >
                  <td className="p-2">Week {article.week_number}</td>
                  <td className="p-2 capitalize">{article.kind}</td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClasses[article.status]}`}
                    >
                      {article.status}
                    </span>
                  </td>
                  {showAssignee && (
                    <td className="p-2">
                      {!article.author_id
                        ? 'Unassigned'
                        : assignee
                          ? getDisplayName(assignee.full_name, assignee.email, 'Unknown member')
                          : // author_id is set but not in the current member list -- their admin
                            // role was likely revoked since assignment, or list_league_members()
                            // failed to load. Distinct from a genuinely unassigned article.
                            'Assigned member no longer found'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
