import { MetadataRoute } from 'next'
import { getPublishedArticles } from '@/lib/supabase/articles'
import siteMetadata from '@/data/siteMetadata'

export const revalidate = 300

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteMetadata.siteUrl

  let articleRoutes: MetadataRoute.Sitemap = []
  try {
    const articles = await getPublishedArticles()
    articleRoutes = articles.map((article) => ({
      url: `${siteUrl}/previews-recaps/${article.slug}`,
      lastModified: article.published_at ?? undefined,
    }))
  } catch (error) {
    console.error('Failed to load published articles for the sitemap:', error)
  }

  const routes = ['', 'previews-recaps', 'league-members', 'conferences', 'poll'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...articleRoutes]
}
