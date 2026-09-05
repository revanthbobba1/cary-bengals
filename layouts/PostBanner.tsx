import { ReactNode } from 'react'
import Image from '@/components/Image'
import Bleed from 'pliny/ui/Bleed'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog } from 'contentlayer/generated'
import Comments from '@/components/Comments'
import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import siteMetadata from '@/data/siteMetadata'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'

interface LayoutProps {
  content: CoreContent<Blog>
  children: ReactNode
  next?: { path: string; title: string }
  prev?: { path: string; title: string }
}

export default function PostMinimal({ content, next, prev, children }: LayoutProps) {
  const { slug, title, images } = content
  const displayImage =
    images && images.length > 0 ? images[0] : 'https://picsum.photos/seed/picsum/800/400'

  return (
    <SectionContainer>
      <ScrollTopAndComment />
      <article>
        <div>
          <div className="space-y-1 pb-10 text-center dark:border-gray-700">
            <div className="w-full">
              <Bleed>
                <div className="aspect-[2/1] w-full relative">
                  <Image src={displayImage} alt={title} fill className="object-cover" />
                </div>
              </Bleed>
            </div>
            <div className="pt-10 relative">
              <PageTitle>{title}</PageTitle>
            </div>
          </div>
          <div className="prose max-w-none py-4 dark:prose-invert">{children}</div>
          {siteMetadata.comments && (
            <div className="pb-6 pt-6 text-center text-gray-700 dark:text-gray-300" id="comment">
              <Comments slug={slug} />
            </div>
          )}
          <footer>
            <div className="flex flex-col gap-3 pt-4 text-sm font-medium sm:flex-row xl:pt-8">
              {prev && prev.path && (
                <Link
                  href={`/${prev.path}`}
                  className="group block flex-1 rounded-control border border-gray-200 bg-white p-4 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark"
                  aria-label={`Previous post: ${prev.title}`}
                >
                  <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    &larr; Previous
                  </h2>
                  <div className="mt-1 font-semibold text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                    {prev.title}
                  </div>
                </Link>
              )}
              {next && next.path && (
                <Link
                  href={`/${next.path}`}
                  className="group block flex-1 rounded-control border border-gray-200 bg-white p-4 text-right shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark"
                  aria-label={`Next post: ${next.title}`}
                >
                  <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Next &rarr;
                  </h2>
                  <div className="mt-1 font-semibold text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                    {next.title}
                  </div>
                </Link>
              )}
            </div>
          </footer>
        </div>
      </article>
    </SectionContainer>
  )
}
