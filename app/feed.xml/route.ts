import { escape } from 'pliny/utils/htmlEscaper.js'
import siteMetadata from '@/data/siteMetadata'
import { getPublishedArticles, type PublishedArticleSummary } from '@/lib/supabase/articles'

export const revalidate = 300

const generateRssItem = (post: PublishedArticleSummary) => `
  <item>
    <guid>${siteMetadata.siteUrl}/previews-recaps/${post.slug}</guid>
    <title>${escape(post.title)}</title>
    <link>${siteMetadata.siteUrl}/previews-recaps/${post.slug}</link>
    ${post.summary ? `<description>${escape(post.summary)}</description>` : ''}
    <pubDate>${new Date(post.published_at ?? Date.now()).toUTCString()}</pubDate>
    <author>${siteMetadata.email} (${siteMetadata.author})</author>
  </item>
`

const generateRss = (posts: PublishedArticleSummary[]) => `
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <title>${escape(siteMetadata.title)}</title>
      <link>${siteMetadata.siteUrl}/previews-recaps</link>
      <description>${escape(siteMetadata.description)}</description>
      <language>${siteMetadata.language}</language>
      <managingEditor>${siteMetadata.email} (${siteMetadata.author})</managingEditor>
      <webMaster>${siteMetadata.email} (${siteMetadata.author})</webMaster>
      <lastBuildDate>${new Date(posts[0]?.published_at ?? Date.now()).toUTCString()}</lastBuildDate>
      <atom:link href="${siteMetadata.siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
      ${posts.map(generateRssItem).join('')}
    </channel>
  </rss>
`

export async function GET() {
  let posts: Awaited<ReturnType<typeof getPublishedArticles>>
  try {
    posts = await getPublishedArticles()
  } catch (error) {
    console.error('Failed to load published articles for the RSS feed:', error)
    return new Response('Failed to generate RSS feed', { status: 500 })
  }

  return new Response(generateRss(posts), {
    headers: { 'Content-Type': 'application/xml' },
  })
}
