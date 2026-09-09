'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NextLink from 'next/link'
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { springSnappy } from '@/lib/motion'
import { focusRingClasses } from '@/lib/focusRing'
import { publishArticleAction, unpublishArticleAction } from 'app/admin/articles/[id]/edit/actions'
import type { Article, ArticleMatchup } from '@/lib/types/article'
import type { Team } from '@/lib/types/poll'

interface Props {
  article: Article
  matchups: ArticleMatchup[]
  isCommissioner: boolean
  /** Teams for this article's season, for the team-name picker. Empty seasons fall back to free text. */
  teamsForSeason: Team[]
  /** team_id -> record as of the most recent locked poll week before this one, for autofill. */
  teamRecords: Record<string, string>
  /** The most recent earlier same-kind article this season, to copy slot labels from. Null if none. */
  copyFromArticleId: string | null
}

/** Sentinel select value meaning "not one of the known teams" -- shows the free-text fallback. */
const CUSTOM_TEAM = '__custom__'

/** Local-only editor state: the DB fields plus a stable client key for React/Reorder identity. */
interface EditableMatchup {
  _key: string
  slot_label: string
  away_team_name: string
  home_team_name: string
  away_team_id: string | null
  home_team_id: string | null
  away_record: string
  home_record: string
  line: string
  away_score: number | null
  home_score: number | null
  body: string
}

function toEditable(m: ArticleMatchup): EditableMatchup {
  return {
    _key: m.id,
    slot_label: m.slot_label ?? '',
    away_team_name: m.away_team_name,
    home_team_name: m.home_team_name,
    away_team_id: m.away_team_id,
    home_team_id: m.home_team_id,
    away_record: m.away_record ?? '',
    home_record: m.home_record ?? '',
    line: m.line ?? '',
    away_score: m.away_score,
    home_score: m.home_score,
    body: m.body,
  }
}

function blankMatchup(): EditableMatchup {
  return {
    _key: crypto.randomUUID(),
    slot_label: '',
    away_team_name: '',
    home_team_name: '',
    away_team_id: null,
    home_team_id: null,
    away_record: '',
    home_record: '',
    line: '',
    away_score: null,
    home_score: null,
    body: '',
  }
}

const inputClasses =
  'w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark disabled:opacity-50'

export default function ArticleEditor({
  article,
  matchups,
  isCommissioner,
  teamsForSeason,
  teamRecords,
  copyFromArticleId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const reduceMotion = useReducedMotion()

  const canEditContent = article.status === 'draft' || isCommissioner

  const [title, setTitle] = useState(article.title)
  const [summary, setSummary] = useState(article.summary ?? '')
  const [introMarkdown, setIntroMarkdown] = useState(article.intro_markdown ?? '')
  const [outroMarkdown, setOutroMarkdown] = useState(article.outro_markdown ?? '')
  const [items, setItems] = useState<EditableMatchup[]>(() => matchups.map(toEditable))

  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [copyingSlots, setCopyingSlots] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    const stop = () => setIsDragging(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [isDragging])

  const updateItem = (key: string, patch: Partial<EditableMatchup>) => {
    setItems((prev) => prev.map((m) => (m._key === key ? { ...m, ...patch } : m)))
  }

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((m) => m._key !== key))
  }

  const moveItem = (key: string, direction: -1 | 1) => {
    setItems((prev) => {
      const fromIndex = prev.findIndex((m) => m._key === key)
      const toIndex = fromIndex + direction
      if (fromIndex === -1 || toIndex < 0 || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleCopySlots = async () => {
    if (!copyFromArticleId) return
    setError(null)
    setCopyingSlots(true)
    try {
      // Only slot labels -- matchup pairings (who plays whom) are different every week in this
      // league's schedule, so copying team names/records from a prior week would insert wrong
      // data. What repeats is the broadcast slot structure (TNF, SNF, MNF, etc.), not who's in it.
      const { data, error: copyError } = await supabase
        .from('article_matchups')
        .select('slot_label')
        .eq('article_id', copyFromArticleId)
        .order('position')

      if (copyError) throw copyError

      setItems((data ?? []).map((m) => ({ ...blankMatchup(), slot_label: m.slot_label ?? '' })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy last week’s slots')
    } finally {
      setCopyingSlots(false)
    }
  }

  const handleSaveDraft = async () => {
    setError(null)
    setSaving(true)
    try {
      const { data, error: fieldsError } = await supabase
        .from('articles')
        .update({
          title,
          summary: summary || null,
          intro_markdown: introMarkdown || null,
          outro_markdown: outroMarkdown || null,
        })
        .eq('id', article.id)
        .select('id')

      if (fieldsError) throw fieldsError
      // RLS silently filters a blocked update rather than erroring (same gotcha
      // PollWeekManager's deadline updates guard against) -- a published article an
      // author no longer has permission to edit would otherwise fail invisibly here.
      if (!data || data.length === 0) {
        throw new Error('Could not save -- unpublish this article before editing it.')
      }

      const { error: matchupsError } = await supabase.rpc('save_article_matchups', {
        p_article_id: article.id,
        p_matchups: items.map((m) => ({
          slot_label: m.slot_label || null,
          away_team_name: m.away_team_name,
          home_team_name: m.home_team_name,
          away_team_id: m.away_team_id,
          home_team_id: m.home_team_id,
          away_record: m.away_record || null,
          home_record: m.home_record || null,
          line: m.line || null,
          away_score: m.away_score,
          home_score: m.home_score,
          body: m.body,
        })),
      })

      if (matchupsError) throw matchupsError

      toast.success('Draft saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    setError(null)
    setPublishing(true)
    try {
      const result = await publishArticleAction(article.id, article.slug)
      if (result.error) throw new Error(result.error)
      toast.success('Article published.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish article')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setError(null)
    setUnpublishing(true)
    try {
      const result = await unpublishArticleAction(article.id, article.slug)
      if (result.error) throw new Error(result.error)
      toast.success('Article unpublished.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish article')
    } finally {
      setUnpublishing(false)
    }
  }

  const anyActionInFlight = saving || publishing || unpublishing || copyingSlots

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {article.season_year} &middot; Week {article.week_number} &middot; {article.kind}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
          Edit Article
        </h1>
      </div>

      {error && (
        <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!canEditContent && (
        <div className="rounded-control bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          This article is published. Unpublish it before editing the content below.
        </div>
      )}

      <div className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
        <div>
          <label htmlFor="article-title" className="block text-sm font-medium mb-1">
            Title
          </label>
          <input
            id="article-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEditContent}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="article-summary" className="block text-sm font-medium mb-1">
            Summary
          </label>
          <textarea
            id="article-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={!canEditContent}
            rows={2}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="article-intro" className="block text-sm font-medium mb-1">
            Intro (optional)
          </label>
          <textarea
            id="article-intro"
            value={introMarkdown}
            onChange={(e) => setIntroMarkdown(e.target.value)}
            disabled={!canEditContent}
            rows={3}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="article-outro" className="block text-sm font-medium mb-1">
            Outro (optional)
          </label>
          <textarea
            id="article-outro"
            value={outroMarkdown}
            onChange={(e) => setOutroMarkdown(e.target.value)}
            disabled={!canEditContent}
            rows={3}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Matchups</h2>
          <div className="flex gap-2">
            {items.length === 0 && copyFromArticleId && (
              <button
                type="button"
                onClick={handleCopySlots}
                disabled={!canEditContent || anyActionInFlight}
                className={`rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition-all duration-150 ease-out-expo hover:border-gray-300 hover:bg-gray-50 ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-900`}
              >
                {copyingSlots ? 'Copying...' : 'Copy Last Week’s Slots'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, blankMatchup()])}
              disabled={!canEditContent || anyActionInFlight}
              className={`rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition-all duration-150 ease-out-expo hover:border-gray-300 hover:bg-gray-50 ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-900`}
            >
              + Add Matchup
            </button>
          </div>
        </div>

        {items.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No matchups yet.</p>
        )}

        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="space-y-3 select-none"
        >
          {items.map((item, index) => (
            <MatchupEditorRow
              key={item._key}
              item={item}
              index={index}
              isLast={index === items.length - 1}
              kind={article.kind}
              disabled={!canEditContent}
              isDragging={isDragging}
              onDragHandleDown={() => setIsDragging(true)}
              onChange={(patch) => updateItem(item._key, patch)}
              onRemove={() => removeItem(item._key)}
              onMove={(direction) => moveItem(item._key, direction)}
              reduceMotion={Boolean(reduceMotion)}
              teamsForSeason={teamsForSeason}
              teamRecords={teamRecords}
            />
          ))}
        </Reorder.Group>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={!canEditContent || anyActionInFlight}
          className={`rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50`}
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>

        <NextLink
          href={`/admin/articles/${article.id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          title="Shows the last saved draft, not unsaved changes -- save first to preview them"
          className={`rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-150 ease-out-expo hover:bg-gray-50 ${focusRingClasses} active:scale-[0.97] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900`}
        >
          Preview
        </NextLink>

        {article.status === 'draft' ? (
          <button
            type="button"
            onClick={handlePublish}
            disabled={anyActionInFlight}
            className={`rounded-full bg-gray-700 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 ease-out-expo hover:bg-gray-800 ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500`}
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleUnpublish}
            disabled={anyActionInFlight}
            className={`rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-150 ease-out-expo hover:bg-gray-50 ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900`}
          >
            {unpublishing ? 'Unpublishing...' : 'Unpublish'}
          </button>
        )}
      </div>
    </div>
  )
}

interface MatchupEditorRowProps {
  item: EditableMatchup
  index: number
  isLast: boolean
  kind: Article['kind']
  disabled: boolean
  isDragging: boolean
  onDragHandleDown: () => void
  onChange: (patch: Partial<EditableMatchup>) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  reduceMotion: boolean
  teamsForSeason: Team[]
  teamRecords: Record<string, string>
}

function MatchupEditorRow({
  item,
  index,
  isLast,
  kind,
  disabled,
  isDragging,
  onDragHandleDown,
  onChange,
  onRemove,
  onMove,
  reduceMotion,
  teamsForSeason,
  teamRecords,
}: MatchupEditorRowProps) {
  const dragControls = useDragControls()
  const interactiveHover = isDragging
    ? ''
    : 'hover:bg-gray-100 hover:text-ink dark:hover:bg-gray-800 dark:hover:text-gray-100'

  const parseScore = (value: string): number | null => {
    if (value === '') return null
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }

  // teams.name carries a trailing "(Owner)" suffix for the poll UI's benefit (e.g. "Code Monkey
  // (PR #414) (Ankith)"), but article_matchups' display convention -- set by all 19 backfilled
  // articles -- never includes it (just "Code Monkey (PR #414)"). Strip exactly that known
  // suffix, the same way the backfill parser's peelSide() stripped a trailing "(Owner)" paren
  // when it recognized the content as a known owner name, rather than guessing with a generic
  // regex that could wrongly eat a legitimate parenthetical nickname.
  const displayName = (team: Team) => {
    const suffix = `(${team.owner_name})`
    return team.name.endsWith(suffix) ? team.name.slice(0, -suffix.length).trim() : team.name
  }

  // Selecting a real team sets both the display name and the FK, and refreshes the record from
  // last week's poll results if we have one for them -- a fresh team means the old record no
  // longer applies regardless of what was typed before. Picking "Custom..." just clears the FK;
  // the team name stays editable as free text below the select.
  const handleTeamSelect = (side: 'away' | 'home', teamId: string) => {
    if (teamId === CUSTOM_TEAM) {
      onChange(side === 'away' ? { away_team_id: null } : { home_team_id: null })
      return
    }
    const team = teamsForSeason.find((t) => t.id === teamId)
    if (!team) return
    // Always overwrite the record, even to '' when we have none for this team -- a fresh team
    // means the old record no longer applies regardless of what was typed before.
    const record = teamRecords[team.id] ?? ''
    onChange(
      side === 'away'
        ? { away_team_name: displayName(team), away_team_id: team.id, away_record: record }
        : { home_team_name: displayName(team), home_team_id: team.id, home_record: record }
    )
  }

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{
        scale: 1.01,
        boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.25), 0 8px 10px -6px rgb(0 0 0 / 0.15)',
        zIndex: 1,
        transition: springSnappy,
      }}
      transition={reduceMotion ? { duration: 0 } : springSnappy}
      className={`rounded-card border border-gray-200 bg-white p-4 shadow-card transition-shadow duration-150 ease-out-expo dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark ${isDragging ? '' : 'hover:shadow-raised dark:hover:shadow-raised-dark'}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            onPointerDown={(e) => {
              if (disabled) return
              onDragHandleDown()
              dragControls.start(e)
            }}
            className={`flex flex-shrink-0 items-center justify-center rounded-control p-2 text-gray-400 transition-colors duration-150 ease-out-expo ${disabled ? 'cursor-not-allowed opacity-50' : `cursor-grab touch-none active:cursor-grabbing ${interactiveHover}`}`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M7 4a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6-12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
          </div>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            aria-label="Move up"
            className={`flex h-8 w-8 items-center justify-center rounded-control text-gray-400 transition-all duration-150 ease-out-expo active:scale-90 ${focusRingClasses} disabled:pointer-events-none disabled:opacity-25 ${interactiveHover}`}
          >
            &uarr;
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || isLast}
            aria-label="Move down"
            className={`flex h-8 w-8 items-center justify-center rounded-control text-gray-400 transition-all duration-150 ease-out-expo active:scale-90 ${focusRingClasses} disabled:pointer-events-none disabled:opacity-25 ${interactiveHover}`}
          >
            &darr;
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className={`text-sm font-medium text-red-600 hover:text-red-700 ${focusRingClasses} disabled:pointer-events-none disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300`}
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={`${item._key}-slot`}
            className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
          >
            Slot Label (optional)
          </label>
          <input
            id={`${item._key}-slot`}
            type="text"
            value={item.slot_label}
            onChange={(e) => onChange({ slot_label: e.target.value })}
            disabled={disabled}
            placeholder="TNF (Prime)"
            className={inputClasses}
          />
        </div>
        <TeamPicker
          idPrefix={`${item._key}-away`}
          label="Away Team"
          teamsForSeason={teamsForSeason}
          selectedTeamId={item.away_team_id}
          teamName={item.away_team_name}
          disabled={disabled}
          onSelectTeam={(teamId) => handleTeamSelect('away', teamId)}
          onNameChange={(name) => onChange({ away_team_name: name })}
        />
        <TeamPicker
          idPrefix={`${item._key}-home`}
          label="Home Team"
          teamsForSeason={teamsForSeason}
          selectedTeamId={item.home_team_id}
          teamName={item.home_team_name}
          disabled={disabled}
          onSelectTeam={(teamId) => handleTeamSelect('home', teamId)}
          onNameChange={(name) => onChange({ home_team_name: name })}
        />
        <div>
          <label
            htmlFor={`${item._key}-away-record`}
            className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
          >
            Away Record
          </label>
          <input
            id={`${item._key}-away-record`}
            type="text"
            value={item.away_record}
            onChange={(e) => onChange({ away_record: e.target.value })}
            disabled={disabled}
            placeholder="2-5"
            className={inputClasses}
          />
        </div>
        <div>
          <label
            htmlFor={`${item._key}-home-record`}
            className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
          >
            Home Record
          </label>
          <input
            id={`${item._key}-home-record`}
            type="text"
            value={item.home_record}
            onChange={(e) => onChange({ home_record: e.target.value })}
            disabled={disabled}
            placeholder="6-2"
            className={inputClasses}
          />
        </div>

        {kind === 'preview' ? (
          <div className="sm:col-span-2">
            <label
              htmlFor={`${item._key}-line`}
              className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
            >
              Line (optional)
            </label>
            <input
              id={`${item._key}-line`}
              type="text"
              value={item.line}
              onChange={(e) => onChange({ line: e.target.value })}
              disabled={disabled}
              placeholder="CM -13.1"
              className={inputClasses}
            />
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor={`${item._key}-away-score`}
                className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
              >
                Away Score
              </label>
              <input
                id={`${item._key}-away-score`}
                type="number"
                step="0.01"
                value={item.away_score ?? ''}
                onChange={(e) => onChange({ away_score: parseScore(e.target.value) })}
                disabled={disabled}
                className={inputClasses}
              />
            </div>
            <div>
              <label
                htmlFor={`${item._key}-home-score`}
                className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
              >
                Home Score
              </label>
              <input
                id={`${item._key}-home-score`}
                type="number"
                step="0.01"
                value={item.home_score ?? ''}
                onChange={(e) => onChange({ home_score: parseScore(e.target.value) })}
                disabled={disabled}
                className={inputClasses}
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label
            htmlFor={`${item._key}-body`}
            className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
          >
            Body
          </label>
          <textarea
            id={`${item._key}-body`}
            value={item.body}
            onChange={(e) => onChange({ body: e.target.value })}
            disabled={disabled}
            rows={4}
            className={inputClasses}
          />
        </div>
      </div>
    </Reorder.Item>
  )
}

interface TeamPickerProps {
  idPrefix: string
  label: string
  teamsForSeason: Team[]
  selectedTeamId: string | null
  teamName: string
  disabled: boolean
  onSelectTeam: (teamId: string) => void
  onNameChange: (name: string) => void
}

/** Away/home team picker: a dropdown of this season's teams, falling back to a free-text name
 * field when "Custom..." is picked or no teams exist for the season. */
function TeamPicker({
  idPrefix,
  label,
  teamsForSeason,
  selectedTeamId,
  teamName,
  disabled,
  onSelectTeam,
  onNameChange,
}: TeamPickerProps) {
  const selectId = `${idPrefix}-select`

  return (
    <div>
      <label
        htmlFor={selectId}
        className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400"
      >
        {label}
      </label>
      {teamsForSeason.length > 0 ? (
        <>
          <select
            id={selectId}
            value={selectedTeamId ?? CUSTOM_TEAM}
            onChange={(e) => onSelectTeam(e.target.value)}
            disabled={disabled}
            className={inputClasses}
          >
            <option value={CUSTOM_TEAM}>Custom...</option>
            {teamsForSeason.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          {!selectedTeamId && (
            <input
              type="text"
              aria-label={`${label} name`}
              value={teamName}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={disabled}
              placeholder="Team name"
              className={`mt-2 ${inputClasses}`}
            />
          )}
        </>
      ) : (
        <input
          id={selectId}
          type="text"
          value={teamName}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={disabled}
          className={inputClasses}
        />
      )}
    </div>
  )
}
