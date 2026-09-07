import PreviewsRecapsList from '@/components/articles/PreviewsRecapsList'
import { getPublishedArticles } from '@/lib/supabase/articles'
import { genPageMetadata } from 'app/seo'

export const revalidate = 300

export const metadata = genPageMetadata({ title: 'Previews & Recaps' })

export default async function PreviewsRecapsPage() {
  const articles = await getPublishedArticles()

  return (
    <div>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Previews & Recaps
        </h1>
      </div>
      <PreviewsRecapsList articles={articles} />
    </div>
  )
}
