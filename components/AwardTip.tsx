import { useId, type ReactNode } from 'react'
import { AWARD_META, type AwardId } from '@/lib/awards/weeklyAwards'
import { focusRingClasses } from '@/lib/focusRing'

// Wraps an award's label so its rule shows in a tooltip. Pure CSS, so it needs no client
// JavaScript: it opens on hover and on keyboard focus, and because the trigger is focusable a tap
// on a phone focuses it and opens it too (a native `title` attribute does neither). The dotted
// underline is the only hint that it's interactive.
export default function AwardTip({ id, children }: { id: AwardId; children: ReactNode }) {
  const tipId = useId()
  return (
    <span
      className={`group relative inline-flex cursor-help rounded underline decoration-dotted decoration-gray-400 underline-offset-4 ${focusRingClasses}`}
      // A focusable span, not a button: Safari on iOS doesn't focus a button on tap, which would
      // keep the tooltip from opening on a phone. A tooltip trigger is the standard exception to
      // this rule.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-describedby={tipId}
    >
      {children}
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-56 max-w-[80vw] rounded-md bg-gray-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white no-underline opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:bg-gray-700"
      >
        {AWARD_META[id].description}
      </span>
    </span>
  )
}
