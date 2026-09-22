'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/Link'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import type { Article } from '@/lib/types/article'
import { getDisplayName } from '@/lib/displayName'
import { focusRingClasses } from '@/lib/focusRing'

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
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()

  const showAssignee = Array.isArray(members)
  const membersById = new Map((members ?? []).map((m) => [m.id, m]))

  const availableYears = [...new Set(articles.map((a) => a.season_year))].sort((a, b) => b - a)
  const [selectedYear, setSelectedYear] = useState(availableYears[0] ?? new Date().getFullYear())

  // Which row's "Assigned To" cell is showing the reassign <select> instead of the plain name.
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [pendingAuthorId, setPendingAuthorId] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const startReassign = (article: Article) => {
    setReassigningId(article.id)
    setPendingAuthorId(article.author_id ?? '')
  }

  const cancelReassign = () => {
    setReassigningId(null)
    setPendingAuthorId('')
  }

  // reassigningId/pendingAuthorId/savingId are shared, not per-row, so a save that finishes
  // after the user has already moved on to editing a different row must not clobber that row's
  // still-in-progress edit -- only clear state for the row that actually finished.
  const finishReassign = (articleId: string) => {
    setReassigningId((current) => {
      if (current !== articleId) return current
      setPendingAuthorId('')
      return null
    })
  }

  const handleReassign = async (article: Article) => {
    // Same "manage all articles" commissioner UPDATE path AssignArticleForm's reassign branch
    // uses -- and the same stale-members-list guard, since this <select> was built from the
    // `members` list loaded at page render, which could be stale by the time this fires.
    if (!members?.some((m) => m.id === pendingAuthorId)) {
      toast.error('No such league member.')
      return
    }
    if (pendingAuthorId === article.author_id) {
      cancelReassign()
      return
    }

    const authorId = pendingAuthorId
    setSavingId(article.id)
    try {
      const { error } = await supabase
        .from('articles')
        .update({ author_id: authorId })
        .eq('id', article.id)
      if (error) throw error

      const newAssignee = members?.find((m) => m.id === authorId)
      router.refresh()
      finishReassign(article.id)
      toast.success(
        `Week ${article.week_number} ${article.kind} reassigned to ${getDisplayName(newAssignee?.full_name, newAssignee?.email, 'Unknown member')}.`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reassign article')
    } finally {
      setSavingId((current) => (current === article.id ? null : current))
    }
  }

  const handleDelete = async (article: Article) => {
    // Drafts only -- a published article is league history, not a to-do that can be discarded.
    if (article.status !== 'draft') return
    if (
      !window.confirm(
        `Delete the Week ${article.week_number} ${article.kind} draft? This cannot be undone.`
      )
    ) {
      return
    }

    setDeletingId(article.id)
    try {
      const { error } = await supabase.from('articles').delete().eq('id', article.id)
      if (error) throw error

      router.refresh()
      toast.success(`Week ${article.week_number} ${article.kind} draft deleted.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete article')
    } finally {
      setDeletingId((current) => (current === article.id ? null : current))
    }
  }

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
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {articlesForSelectedYear.length === 0 && (
              <tr>
                <td
                  colSpan={showAssignee ? 5 : 4}
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
                      {reassigningId === article.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={pendingAuthorId}
                            onChange={(e) => setPendingAuthorId(e.target.value)}
                            disabled={savingId === article.id}
                            className="rounded-control border border-gray-200 bg-white p-1 text-sm text-gray-900 shadow-card dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                          >
                            {(members ?? []).map((member) => (
                              <option key={member.id} value={member.id}>
                                {getDisplayName(member.full_name, member.email, 'Unknown member')}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleReassign(article)}
                            disabled={savingId === article.id}
                            className={`rounded text-sm font-medium text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400 disabled:pointer-events-none disabled:opacity-50`}
                          >
                            {savingId === article.id ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelReassign}
                            disabled={savingId === article.id}
                            className={`rounded text-sm font-medium text-gray-500 hover:text-gray-700 ${focusRingClasses} dark:text-gray-400 dark:hover:text-gray-200 disabled:pointer-events-none disabled:opacity-50`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>
                            {!article.author_id
                              ? 'Unassigned'
                              : assignee
                                ? getDisplayName(
                                    assignee.full_name,
                                    assignee.email,
                                    'Unknown member'
                                  )
                                : // author_id is set but not in the current member list -- their
                                  // admin role was likely revoked since assignment, or
                                  // list_league_members() failed to load. Distinct from a
                                  // genuinely unassigned article.
                                  'Assigned member no longer found'}
                          </span>
                          {article.author_id && (members ?? []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => startReassign(article)}
                              className={`rounded text-sm font-medium text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
                            >
                              Reassign
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/articles/${article.id}/edit`}
                        className={`rounded text-sm font-medium text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
                      >
                        Edit
                      </Link>
                      {showAssignee && article.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(article)}
                          disabled={deletingId === article.id}
                          className={`rounded text-sm font-medium text-red-500 hover:text-red-600 ${focusRingClasses} dark:hover:text-red-400 disabled:pointer-events-none disabled:opacity-50`}
                        >
                          {deletingId === article.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
