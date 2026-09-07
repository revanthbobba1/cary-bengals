import { getPublishedArticles } from '@/lib/supabase/articles'
import Main from './Main'

export default async function Page() {
  const posts = await getPublishedArticles()
  return <Main posts={posts} />
}
