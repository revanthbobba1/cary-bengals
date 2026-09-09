'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
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

  // The very first render must not carry an `initial` state. framer-motion resolves `initial` into
  // the style attribute it emits during SSR, so a plain `initial={{ opacity: 0 }}` ships every
  // page as `<main><div style="opacity:0">` — the whole body invisible until hydration (blank with
  // JS off or a failed bundle, and an LCP hit on every full load), plus a hydration mismatch for
  // reduced-motion users, whose first client render resolves to opacity 1 against the server's 0.
  // `AnimatePresence initial={false}` used to suppress this; without it the suppression has to be
  // explicit. The ref lives on this component, not on the keyed `motion.div`, so a navigation's
  // remount doesn't reset it and every page after the first still fades in.
  const isFirstRender = useRef(true)
  useEffect(() => {
    isFirstRender.current = false
  }, [])

  return (
    <motion.div
      key={pathname}
      initial={isFirstRender.current || reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={easeOut}
    >
      {children}
    </motion.div>
  )
}
