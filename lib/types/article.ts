// Types for the Supabase-backed previews & recaps feature.
// Schema: supabase/migrations/028_create_article_tables.sql
// Design:  docs/PREVIEWS_RECAPS_PLAN.md

export type ArticleKind = 'preview' | 'recap'
export type ArticleStatus = 'draft' | 'published'

export interface Article {
  id: string
  season_year: number
  week_number: number
  kind: ArticleKind
  /** Stored, not derived — seeded from the original MDX file paths so existing URLs survive. */
  slug: string
  title: string
  summary: string | null
  intro_markdown: string | null
  outro_markdown: string | null
  status: ArticleStatus
  published_at: string | null
  /** The assignee, and the byline. Null only if the account was deleted. */
  author_id: string | null
  /** Points at a data/authors/*.mdx entry for the rendered byline (avatar, twitter). */
  author_slug: string | null
  created_at: string
  updated_at: string
}

export interface ArticleMatchup {
  id: string
  article_id: string
  position: number
  /** '## TNF (Prime)', '## Shitter bowl (FOX)' — editorial free text. */
  slot_label: string | null
  /** Display source of truth, frozen at the week it was written (see plan §3.2). */
  away_team_name: string
  home_team_name: string
  /** Optional enrichment link to `teams`; null for historical seasons with no roster rows. */
  away_team_id: string | null
  home_team_id: string | null
  away_record: string | null
  home_record: string | null
  /** 'CM -13.1' — text, because it's a favorite plus a number, not an arithmetic value. */
  line: string | null
  /** Recaps only. Numeric because these are used for winner highlighting and margins. */
  away_score: number | null
  home_score: number | null
  body: string
  created_at: string
  updated_at: string
}

export interface ArticleWithMatchups extends Article {
  matchups: ArticleMatchup[]
}

/**
 * A season's worth of articles keyed by week, for the hub's week-paired rows.
 * Either side can be absent — a week with a preview and no recap is the common case.
 */
export interface WeekPair {
  week_number: number
  preview: Article | null
  recap: Article | null
}

/** Editor form state. Matchups carry no id until they've been saved. */
export interface ArticleMatchupDraft
  extends Omit<ArticleMatchup, 'id' | 'article_id' | 'created_at' | 'updated_at'> {
  id?: string
}

export function isRecap(article: Pick<Article, 'kind'>): article is Article & { kind: 'recap' } {
  return article.kind === 'recap'
}

/**
 * Winner of a played matchup, or null when it hasn't been played, wasn't scored, or tied.
 * Only meaningful on recaps — previews carry no scores.
 */
export function matchupWinner(m: ArticleMatchup): 'away' | 'home' | null {
  if (m.away_score === null || m.home_score === null) return null
  if (m.away_score === m.home_score) return null
  return m.away_score > m.home_score ? 'away' : 'home'
}
