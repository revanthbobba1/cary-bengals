'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// publish_article/the unpublish update both flip whether an article is publicly visible, which
// the public routes only pick up within their `revalidate = 300` ISR window otherwise. These are
// the first Server Actions in this codebase -- every other admin write is a client component
// calling Supabase directly + router.refresh() -- because revalidatePath() is server-only and
// nothing before this needed to touch Next's cache directly.

export async function publishArticleAction(
  articleId: string,
  slug: string
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.rpc('publish_article', { p_article_id: articleId })
  if (error) return { error: error.message }

  revalidatePath('/previews-recaps')
  revalidatePath(`/previews-recaps/${slug}`)
  return { error: null }
}

export async function unpublishArticleAction(
  articleId: string,
  slug: string
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.from('articles').update({ status: 'draft' }).eq('id', articleId)
  if (error) return { error: error.message }

  revalidatePath('/previews-recaps')
  revalidatePath(`/previews-recaps/${slug}`)
  return { error: null }
}
