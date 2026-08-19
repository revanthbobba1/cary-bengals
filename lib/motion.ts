import type { Transition, Variants } from 'framer-motion'

// Matches PollSubmissionForm.tsx's existing ranking-list drag spring — reused as the default so
// every spring in the app feels like the same physical material, not a different one per component.
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 35 }

// Softer/slower for larger surfaces (modals, page-level reveals) where the snappy spring would
// feel frantic at that size.
export const springGentle: Transition = { type: 'spring', stiffness: 300, damping: 30 }

// Non-spring fallback for opacity/scale transitions — keeps to the sub-300ms, ease-out rule of
// thumb (see docs/STYLING_OVERHAUL_PLAN.md Phase -1 findings) rather than a default linear ease.
export const easeOut: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] }

// Scale-in from 0.9, not 0 — starting at 0 reads as popping out of nowhere. Use for
// cards/dropdowns/toasts entering the screen.
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: easeOut },
  exit: { opacity: 0, scale: 0.9, transition: easeOut },
}
