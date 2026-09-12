import Link from 'next/link'
import { focusRingClasses } from '@/lib/focusRing'

type AdminSection = 'dashboard' | 'poll' | 'commissioner' | 'articles'

interface Props {
  active: AdminSection
  showCommissionerTools: boolean
}

const linkClasses = `rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ease-out-expo whitespace-nowrap ${focusRingClasses} active:scale-[0.97]`

// Same badge style as the Commissioner section header on the dashboard (app/admin/page.tsx),
// shortened to fit a nav row — the two "this is commissioner-only" indicators in the app should
// look like the same visual language, not two different ad hoc treatments.
const commissionerBadgeClasses =
  'rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300'

/**
 * Shared in-app navigation for the admin area, used on /admin, /admin/poll,
 * /admin/commissioner, and /admin/articles so a user never has to fall back to
 * the browser's back/forward buttons to move between them.
 *
 * "Commissioner Tools" is pushed to the right, kept visually distinct (different
 * background color), and carries an explicit "Only you" badge (only rendered for
 * commissioners) to reinforce that it's a different kind of action than the
 * member-facing "Dashboard" / "Submit Rankings" links -- color alone wasn't a strong
 * enough signal on its own. "Articles" has no commissioner-only counterpart --
 * /admin/articles is a single route for everyone, since RLS already scopes what each
 * role's query returns (see that page for details), so this link is always shown.
 */
export default function AdminSubNav({ active, showCommissionerTools }: Props) {
  return (
    <nav
      aria-label="Admin navigation"
      className="mb-8 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4 dark:border-gray-700"
    >
      <Link
        href="/admin"
        aria-current={active === 'dashboard' ? 'page' : undefined}
        className={`${linkClasses} ${
          active === 'dashboard'
            ? 'bg-primary-500 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-ink dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/admin/poll"
        aria-current={active === 'poll' ? 'page' : undefined}
        className={`${linkClasses} ${
          active === 'poll'
            ? 'bg-primary-500 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-ink dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
      >
        Submit Rankings
      </Link>
      <Link
        href="/admin/articles"
        aria-current={active === 'articles' ? 'page' : undefined}
        className={`${linkClasses} ${
          active === 'articles'
            ? 'bg-primary-500 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-ink dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
      >
        Articles
      </Link>
      {showCommissionerTools && (
        <span className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/commissioner"
            aria-current={active === 'commissioner' ? 'page' : undefined}
            className={`${linkClasses} ${
              active === 'commissioner'
                ? 'bg-gray-700 text-white dark:bg-gray-600'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            Commissioner Tools
          </Link>
          <span className={commissionerBadgeClasses}>Only you</span>
        </span>
      )}
    </nav>
  )
}
