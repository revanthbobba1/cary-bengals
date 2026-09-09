'use client'

import { useEffect, useMemo, useState } from 'react'
import ArticleCard from './ArticleCard'
import ArticleGridCard from './ArticleGridCard'
import { focusRingClasses } from '@/lib/focusRing'
import type { PublishedArticleSummary } from '@/lib/supabase/articles'

interface WeekGroup {
  week_number: number
  articles: PublishedArticleSummary[]
}

const selectClasses =
  'appearance-none rounded-control border border-gray-200 bg-white py-2 pl-4 pr-10 text-sm font-semibold text-gray-700 shadow-card transition-shadow duration-150 ease-out-expo hover:border-gray-300 focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-gray-600'

export default function ArticlesList({ articles }: { articles: PublishedArticleSummary[] }) {
  const [searchValue, setSearchValue] = useState('')

  // Distinct seasons, newest first, for the pills -- and per-season week groups, each an
  // arbitrary-length list of articles (not a fixed preview+recap pair) so a week just shows
  // however many articles actually exist for it, extensible to more kinds than these two later.
  const seasons = useMemo(
    () => [...new Set(articles.map((a) => a.season_year))].sort((a, b) => b - a),
    [articles]
  )
  const [selectedSeason, setSelectedSeason] = useState(seasons[0])

  // Re-sync if `articles` changes after mount and the selected season no longer has any --
  // otherwise a stale season stays selected and silently shows an empty grid.
  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0])
    }
  }, [seasons, selectedSeason])

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const byWeek = new Map<number, PublishedArticleSummary[]>()
    for (const article of articles) {
      if (article.season_year !== selectedSeason) continue
      const group = byWeek.get(article.week_number) ?? []
      group.push(article)
      byWeek.set(article.week_number, group)
    }
    return [...byWeek.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([week_number, weekArticles]) => ({ week_number, articles: weekArticles }))
  }, [articles, selectedSeason])

  const filteredArticles = useMemo(
    () =>
      articles.filter((article) => {
        const searchContent = [article.title, article.summary, ...article.matchupTeamNames]
          .filter(Boolean)
          .join(' ')
        return searchContent.toLowerCase().includes(searchValue.toLowerCase())
      }),
    [articles, searchValue]
  )

  return (
    <>
      <div className="relative max-w-lg pb-8">
        <label>
          <span className="sr-only">Search articles</span>
          <input
            aria-label="Search articles"
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search articles"
            className="block w-full rounded-full border border-gray-200 bg-white px-5 py-2.5 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo placeholder:text-gray-400 focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-accent-400 dark:focus:ring-accent-400"
          />
          <svg
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </label>
      </div>

      {searchValue ? (
        <ul className="border-t border-gray-100 dark:border-gray-800">
          {!filteredArticles.length && 'No articles found.'}
          {filteredArticles.map((article) => (
            <li
              key={article.id}
              className="border-b border-gray-100 last:border-none dark:border-gray-800"
            >
              <ArticleCard article={article} />
            </li>
          ))}
        </ul>
      ) : articles.length === 0 ? (
        <p className="border-t border-gray-100 py-8 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No articles found.
        </p>
      ) : (
        <>
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {seasons.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedSeason(year)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-150 ease-out-expo ${focusRingClasses} active:scale-[0.97] ${
                    year === selectedSeason
                      ? 'border-primary-500 bg-primary-500 text-white shadow-[0_4px_12px_-2px_rgba(249,115,22,.35)]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-900'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
            {weekGroups.length > 1 && (
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                Jump to
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    document
                      .getElementById(`week-${e.target.value}`)
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className={selectClasses}
                >
                  <option value="" disabled>
                    Select a week
                  </option>
                  {weekGroups.map((group) => (
                    <option key={group.week_number} value={group.week_number}>
                      Week {group.week_number}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div>
            {weekGroups.map((group, index) => (
              <div
                key={group.week_number}
                id={`week-${group.week_number}`}
                className={`flex scroll-mt-24 flex-col gap-6 py-7 sm:flex-row sm:items-start ${
                  index === 0 ? '' : 'border-t border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className="flex-none text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 sm:w-24 sm:pt-6">
                  Week {group.week_number}
                </div>
                <div className="flex flex-1 flex-wrap gap-4">
                  {group.articles.map((article) => (
                    <ArticleGridCard key={article.id} article={article} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
