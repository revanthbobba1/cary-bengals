'use client'

import { useState } from 'react'
import ArticleCard from './ArticleCard'
import type { PublishedArticleSummary } from '@/lib/supabase/articles'

export default function PreviewsRecapsList({ articles }: { articles: PublishedArticleSummary[] }) {
  const [searchValue, setSearchValue] = useState('')

  const filteredArticles = articles.filter((article) => {
    const searchContent = article.title + (article.summary ?? '')
    return searchContent.toLowerCase().includes(searchValue.toLowerCase())
  })

  return (
    <>
      <div className="relative max-w-lg pb-8">
        <label>
          <span className="sr-only">Search articles</span>
          <input
            aria-label="Search articles"
            type="text"
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
    </>
  )
}
