import { Authors, allAuthors } from 'contentlayer/generated'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import AuthorLayout from '@/layouts/AuthorLayout'
import { coreContent } from 'pliny/utils/contentlayer'
import { genPageMetadata } from 'app/seo'

export const metadata = genPageMetadata({ title: 'League Members' })

export default function Page() {
  return (
    <>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          League Members
        </h1>
      </div>
      {allAuthors.map((author) => {
        const mainContent = coreContent(author as Authors)
        return (
          <div key={author.slug}>
            <AuthorLayout content={mainContent}>
              <MDXLayoutRenderer code={author.body.code} />
            </AuthorLayout>
          </div>
        )
      })}
    </>
  )
}
