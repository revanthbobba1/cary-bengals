'use server'

import { createClient } from '@/lib/supabase/server'

// publish_article/the unpublish update both flip whether an article is publicly visible. The
// public article routes are `force-dynamic` (see docs/NETLIFY_DEPLOYMENT.md), so there's no cache
// to purge here -- these only need to write and return a readable error. They were Server Actions
// to call revalidatePath(), which is why they aren't client-side Supabase calls like other writes.

export async function publishArticleAction(articleId: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.rpc('publish_article', { p_article_id: articleId })
  if (error) return { error: error.message }

  return { error: null }
}

export async function unpublishArticleAction(articleId: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('articles')
    .update({ status: 'draft' })
    .eq('id', articleId)
    .select('id')
  if (error) return { error: error.message }
  // RLS silently filters a blocked update rather than erroring (same gotcha
  // ArticleEditor's handleSaveDraft already guards against) -- without this check, an
  // unauthorized caller invoking this action directly would see a false "success".
  if (!data || data.length === 0) {
    return { error: 'Could not unpublish -- you do not have permission to edit this article.' }
  }

  return { error: null }
}
