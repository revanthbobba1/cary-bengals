'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { easeOut } from '@/lib/motion'
import type { ReactNode } from 'react'

/**
 * Fades each page in on arrival.
 *
 * Deliberately enter-only, with NO `AnimatePresence` around it. In the App Router the `{children}`
 * this wraps is a `<LayoutRouter>`, and on a client-side navigation that component *suspends*
 * while it fetches the next segment's RSC payload. `AnimatePresence` is not Suspense-aware: it
 * owns its children's mount/unmount and re-creates the subtree on each of React's retry renders,
 * so the suspended router never resumes — it remounts, throws away the in-flight cache node, and
 * fires a fresh RSC request, forever. The visible result was a nav click that did nothing while
 * the same `?_rsc=` URL was requested hundreds of times a minute (docs/KNOWN_ISSUE_NAV_STUCK.md).
 *
 * An exit animation is not recoverable here either: `usePathname()` only changes once the
 * navigation transition commits, so the old page's key was already gone by the time anything
 * could animate it out. Fading the new page in is what actually rendered before, and it survives
 * because a plain `motion.div` is just a div with a ref — it holds no state across a suspension.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={easeOut}
    >
      {children}
    </motion.div>
  )
}
