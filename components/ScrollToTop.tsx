'use client'

import { useEffect, useState } from 'react'
import { scrollBehavior } from '@/lib/motion'

const ScrollToTop = () => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handleWindowScroll = () => {
      if (window.scrollY > 50) setShow(true)
      else setShow(false)
    }

    window.addEventListener('scroll', handleWindowScroll)
    return () => window.removeEventListener('scroll', handleWindowScroll)
  }, [])

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }
  return (
    <div
      className={`fixed bottom-8 right-8 hidden flex-col gap-3 ${show ? 'md:flex' : 'md:hidden'}`}
    >
      <button
        aria-label="Scroll To Top"
        onClick={handleScrollTop}
        className="rounded-full border border-gray-200 bg-white p-2.5 text-gray-500 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:text-ink hover:shadow-raised active:scale-90 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark dark:hover:text-gray-100 dark:hover:shadow-raised-dark"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}

export default ScrollToTop
