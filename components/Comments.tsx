'use client'

import { Comments as CommentsComponent } from 'pliny/comments'
import { useState } from 'react'
import siteMetadata from '@/data/siteMetadata'
import { focusRingClasses } from '@/lib/focusRing'

export default function Comments({ slug }: { slug: string }) {
  const [loadComments, setLoadComments] = useState(false)
  return (
    <>
      {!loadComments && (
        <button
          onClick={() => setLoadComments(true)}
          className={`inline-flex items-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 ease-out-expo hover:border-gray-300 hover:bg-gray-50 hover:text-ink ${focusRingClasses} active:scale-[0.97] dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-100`}
        >
          Load Comments
        </button>
      )}
      {siteMetadata.comments && loadComments && (
        <CommentsComponent commentsConfig={siteMetadata.comments} slug={slug} />
      )}
    </>
  )
}
