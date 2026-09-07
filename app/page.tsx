import { getPublishedArticles } from '@/lib/supabase/articles'
import Main from './Main'

export const revalidate = 300

export default async function Page() {
  let posts: Awaited<ReturnType<typeof getPublishedArticles>> = []
  try {
    posts = await getPublishedArticles()
  } catch (error) {
    console.error('Failed to load published articles for the home feed:', error)
  }
  return <Main posts={posts} />
}
