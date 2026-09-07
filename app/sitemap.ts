import { MetadataRoute } from 'next'
import { getPublishedArticles } from '@/lib/supabase/articles'
import siteMetadata from '@/data/siteMetadata'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteMetadata.siteUrl
  const articles = await getPublishedArticles()
  const articleRoutes = articles.map((article) => ({
    url: `${siteUrl}/previews-recaps/${article.slug}`,
    lastModified: article.published_at ?? undefined,
  }))

  const routes = ['', 'previews-recaps', 'league-members', 'conferences', 'poll'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...articleRoutes]
}
