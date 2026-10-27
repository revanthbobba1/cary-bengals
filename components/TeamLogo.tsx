'use client'

// Small enough to sit inline with a team name without dominating the row; hidden outright on
// load failure (a dead/changed ESPN URL) rather than showing a broken-image icon -- the name
// text next to it already carries the real information. A Client Component specifically because
// onError needs interactivity a Server Component can't carry (AuthorLayout, one of this
// component's two callers, is one) -- "Event handlers cannot be passed to Client Component
// props" is the exact error a plain <img onError> throws there otherwise.
export default function TeamLogo({ src }: { src: string | null }) {
  if (!src) return null
  return (
    // External ESPN-hosted logos (often SVG) aren't a fit for next/image's optimizer, which
    // also requires allowlisting every source domain for something purely decorative.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-full object-contain"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
