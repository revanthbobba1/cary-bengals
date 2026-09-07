import { createPublicClient } from './public'
import type { Article, ArticleWithMatchups } from '@/lib/types/article'

export type PublishedArticleSummary = Pick<
  Article,
  'id' | 'slug' | 'title' | 'summary' | 'season_year' | 'week_number' | 'kind' | 'published_at'
>

/**
 * All published articles, newest first. Shared by the list page, the home feed, the sitemap, and
 * prev/next lookups on the detail page -- all of them need "the full published list," and at
 * today's row count (dozens, growing ~1-2/week) fetching it fresh per request is cheap.
 */
export async function getPublishedArticles(): Promise<PublishedArticleSummary[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, summary, season_year, week_number, kind, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error
  return data ?? []
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
