import type { Transition } from 'framer-motion'

// Matches PollSubmissionForm.tsx's existing ranking-list drag spring — reused as the default so
// every spring in the app feels like the same physical material, not a different one per component.
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 35 }

// Non-spring fallback for opacity/scale transitions — keeps to the sub-300ms, ease-out rule of
// thumb (see docs/STYLING_OVERHAUL_PLAN.md Phase -1 findings) rather than a default linear ease.
export const easeOut: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] }

// Read at call time rather than via framer-motion's `useReducedMotion()` hook, for the imperative
// scrolling helpers that run inside event handlers rather than during render.
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** `behavior` for imperative `scrollTo`/`scrollIntoView` calls, honouring reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
