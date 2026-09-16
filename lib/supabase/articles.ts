import { createPublicClient } from './public'
import type { Article, ArticleKind, ArticleWithMatchups } from '@/lib/types/article'

export type PublishedArticleSummary = Pick<
  Article,
  'id' | 'slug' | 'title' | 'summary' | 'season_year' | 'week_number' | 'kind' | 'published_at'
> & {
  /** Away/home team names from this article's matchups -- not rendered, only for search matching. */
  matchupTeamNames: string[]
}

// Keeps the public list page usable while styling/testing locally before a Supabase project is
// available. This is deliberately development-only; production still fails visibly if its data
// connection is misconfigured instead of silently showing fake content.
const localArticleFixtures: PublishedArticleSummary[] = [
  {
    id: 'local-2026-week-1-preview',
    slug: '2026/week-one-preview',
    title: '2026 Week 1 Preview',
    summary: '2026 Week 1 Preview',
    season_year: 2026,
    week_number: 1,
    kind: 'preview',
    published_at: '2026-09-07T12:00:00.000Z',
    matchupTeamNames: [],
  },
  {
    id: 'local-2026-week-2-preview',
    slug: '2026/week-two-preview',
    title: '2026 Week 2 Preview',
    summary: '2026 Week 2 Preview',
    season_year: 2026,
    week_number: 2,
    kind: 'preview',
    published_at: '2026-09-14T12:00:00.000Z',
    matchupTeamNames: [],
  },
]

function useLocalArticleFixtures() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isPlaceholder = !url || url.includes('your-project-ref')
  return process.env.NODE_ENV !== 'production' && isPlaceholder
}

/**
 * All published articles, newest first. Shared by the list page, the home feed, the sitemap, and
 * prev/next lookups on the detail page -- all of them need "the full published list," and at
 * today's row count (dozens, growing ~1-2/week) fetching it fresh per request is cheap.
 */
export async function getPublishedArticles(): Promise<PublishedArticleSummary[]> {
  if (useLocalArticleFixtures()) return localArticleFixtures

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('articles')
    .select(
      'id, slug, title, summary, season_year, week_number, kind, published_at, article_matchups(away_team_name, home_team_name)'
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(({ article_matchups: matchups, ...article }) => ({
    ...article,
    matchupTeamNames: (matchups ?? []).flatMap((m) => [m.away_team_name, m.home_team_name]),
  }))
}

/** One published article with its matchups, in display order. Null if not found or not published. */
export async function getArticleBySlug(slug: string): Promise<ArticleWithMatchups | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('articles')
    .select('*, article_matchups(*)')
    .eq('slug', slug)
    .eq('status', 'published')
    .order('position', { foreignTable: 'article_matchups' })
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { article_matchups: matchups, ...article } = data
  return { ...article, matchups } as ArticleWithMatchups
}

/**
 * The other kind's published article for the same season/week (a recap's preview, or vice
 * versa), for the article page's preview/recap cross-link. At most one row can ever match --
 * `UNIQUE (season_year, week_number, kind)` guarantees it. Null if that week's other half was
 * never written or isn't published yet.
 */
export async function getSiblingArticle(
  seasonYear: number,
  weekNumber: number,
  excludeKind: ArticleKind
): Promise<Pick<Article, 'slug' | 'title' | 'kind'> | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('articles')
    .select('slug, title, kind')
    .eq('season_year', seasonYear)
    .eq('week_number', weekNumber)
    .eq('status', 'published')
    .neq('kind', excludeKind)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Published articles with their matchups, for the kbar search index. Matchup team names and
 * body text get folded into the search keywords so a team name is actually findable -- today's
 * build-time index only ever indexed title+summary (see docs/PREVIEWS_RECAPS_PLAN.md §2.3).
 */
export async function getPublishedArticlesForSearchIndex(): Promise<ArticleWithMatchups[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('articles')
    .select('*, article_matchups(*)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(({ article_matchups: matchups, ...article }) => ({
    ...article,
    matchups,
  })) as ArticleWithMatchups[]
}
