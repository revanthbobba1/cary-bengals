'use client'

import { useEffect } from 'react'
import { scrollBehavior } from '@/lib/motion'

/**
 * Handles same-page `#hash` links (the article TOC and the scoreboard strip), so that smooth
 * scrolling can be asked for per-jump instead of via a global `scroll-smooth` class on `<html>`.
 *
 * That class set `scroll-behavior: smooth` on the *document* scroller, which is the same scroller
 * Next.js scrolls programmatically — scroll restoration on back/forward, and the scroll-to-top on
 * every navigation. Making those animate is not what any of them want, and in a browser where
 * smooth scrolling is unavailable or turned off they degrade to no-ops rather than to instant
 * jumps, which strands the page at its old offset. Scoping the request to the one interaction that
 * actually wants it leaves Next's own scrolling alone.
 *
 * It also lets the jump honour `prefers-reduced-motion`, which the CSS class did not.
 *
 * `preventDefault()` + `scrollIntoView` rather than letting the browser do the fragment scroll:
 * that keeps the behaviour identical whatever `scroll-behavior` happens to be, and is what makes
 * the reduced-motion branch possible.
 */
export default function SmoothHashScroll() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest?.('a')
      const href = anchor?.getAttribute('href')
      if (!href || !href.startsWith('#') || href === '#') return
      if (anchor?.target && anchor.target !== '_self') return

      // `scroll-margin-top` on the target (the matchup sections set `scroll-mt-28`) is what keeps
      // the heading clear of the sticky header, and `scrollIntoView` respects it just as native
      // fragment scrolling would.
      const target = document.getElementById(decodeURIComponent(href.slice(1)))
      if (!target) return

      event.preventDefault()
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
      history.pushState(null, '', href)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
