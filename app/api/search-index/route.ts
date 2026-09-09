import { getPublishedArticlesForSearchIndex } from '@/lib/supabase/articles'

export const revalidate = 300

export async function GET() {
  let articles: Awaited<ReturnType<typeof getPublishedArticlesForSearchIndex>>
  try {
    articles = await getPublishedArticlesForSearchIndex()
  } catch (error) {
    console.error('Failed to load published articles for the search index:', error)
    return new Response('Failed to generate search index', { status: 500 })
  }

  const documents = articles.map((article) => {
    const keywords = [
      article.summary,
      ...article.matchups.flatMap((m) => [m.away_team_name, m.home_team_name, m.body]),
    ]
      .filter(Boolean)
      .join(' ')

    return {
      path: `articles/${article.slug}`,
      title: article.title,
      summary: keywords,
      date: article.published_at,
    }
  })

  return Response.json(documents)
}
