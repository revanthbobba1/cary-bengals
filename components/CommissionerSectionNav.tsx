import Link from 'next/link'
import { focusRingClasses } from '@/lib/focusRing'

export type CommissionerSection = 'poll' | 'press' | 'espn'

export const commissionerSections: Array<{ id: CommissionerSection; label: string }> = [
  { id: 'poll', label: 'Poll' },
  { id: 'press', label: 'Press Conferences' },
  { id: 'espn', label: 'ESPN Sync' },
]

/**
 * Second-level tabs inside /admin/commissioner, one per kind of commissioner work. Underline
 * style (rather than AdminSubNav's pills) so the two rows read as different levels of nav.
 * Add new commissioner tools as a new section here rather than appending to an existing one.
 */
export default function CommissionerSectionNav({ active }: { active: CommissionerSection }) {
  return (
    <nav
      aria-label="Commissioner sections"
      className="mb-8 flex flex-wrap gap-x-6 border-b border-gray-200 dark:border-gray-700"
    >
      {commissionerSections.map(({ id, label }) => (
        <Link
          key={id}
          href={`/admin/commissioner?section=${id}`}
          aria-current={active === id ? 'page' : undefined}
          className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${focusRingClasses} ${
            active === id
              ? 'border-primary-500 text-ink dark:text-gray-100'
              : 'border-transparent text-gray-500 hover:text-ink dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
