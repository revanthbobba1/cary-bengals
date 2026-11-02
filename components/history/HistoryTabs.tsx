import Link from 'next/link'

export const HISTORY_TABS = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'owners', label: 'All-time' },
  { key: 'records', label: 'Records' },
  { key: 'transactions', label: 'Transactions' },
] as const

export type HistoryTab = (typeof HISTORY_TABS)[number]['key']

export default function HistoryTabs({ active }: { active: HistoryTab }) {
  return (
    <nav aria-label="League history sections" className="flex flex-wrap gap-2 pb-6">
      {HISTORY_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/history?tab=${tab.key}`}
          aria-current={tab.key === active ? 'page' : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab.key === active
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
