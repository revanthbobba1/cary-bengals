# Styling & Interaction Overhaul — Plan

Living document for making Cary Bengals feel like a modern, actively-crafted product instead of
a largely-unmodified [tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog)
scaffold. Scope is presentation and interaction — motion, depth, typography, micro-interactions —
not new features or data/backend changes. See `POLL_SYSTEM_PLAN.md` and `ESPN_INTEGRATION_PLAN.md`
for the feature work this doc is deliberately not touching.

Last reviewed: 2026-08-19

## 1. Goal

Move the app's look and feel from "static, plain HTML" toward the smoother, motion-aware,
detail-considered style associated with current frontier-lab and startup product design (Linear,
Vercel, Raycast, Anthropic's own product surfaces, etc.) — without a full rebrand or a framework
migration. Concretely: things should move with purpose (springy, not linear-eased or absent),
have depth (soft shadows/layering instead of flat 1px borders), and respond to interaction
(hover/press/focus states everywhere something is clickable) — none of which the app currently
does in any consistent way.

**Scope is the entire application, not just the poll feature.** Public pages (newsfeed, press
conferences, member profiles), the nav/footer shell, and admin/poll surfaces should all end up
feeling like one consistently modern, sleek, smooth product — not a polished poll section bolted
onto an otherwise-template site. The poll ranking list is referenced throughout this doc only
because it's the one place Framer Motion is *already* used (an existing proof-of-concept to extend
the language from), not because the scope is limited to it — see the Phase 1/2/3/4 breakdown in
§4, which spans nav, content, and admin/poll surfaces alike.

## 2. Current State Audit

Grounded in what's actually in the repo today, not assumptions:

- **`framer-motion` is already a dependency** (`^13.1.0`) but is used in exactly one place —
  `PollSubmissionForm.tsx`'s drag-to-reorder ranking list. Nowhere else in the app has any motion
  library involvement.
- **`css/tailwind.css` is 31 lines** and contains no custom transition, animation, or motion
  utility of any kind — just template boilerplate (task-list styling, footnote spacing, an
  autofill-color workaround).
- **`Header.tsx`** — nav links, the search/theme/mobile-nav icon cluster: zero hover states,
  zero active-route indication, zero transitions. Same for `Footer.tsx` and `MobileNav.tsx`.
- **`Card.tsx`** (press-conference grid, used elsewhere too) — flat `rounded-md`, a static
  `border-2 border-gray-200`, no shadow, no hover lift/scale, no image zoom-on-hover. This is the
  most template-default component in the app.
- **Admin surfaces (`PollWeekManager.tsx`, `app/admin/page.tsx`)** — plain white/gray cards, no
  loading skeletons (a blank `router.refresh()` gap instead), and error handling still uses raw
  browser `alert()` (`handleUpdateDeadline`, `handleToggleLock`) — about as far from "modern
  product feel" as a UI affordance gets.
- **No route/page transitions** — Next.js App Router navigation is an instant hard swap, no
  shared-element or fade/slide transition between pages.
- **No loading states** — no skeletons, spinners are ad hoc single-word text ("Loading...",
  "Submitting...") rather than a consistent pattern.
- **Color system is stock Tailwind** (`colors.orange` as `primary`, `colors.gray` as `gray`,
  `tailwind.config.js`) — functional, not refined. No secondary/accent color, no elevation-aware
  surface tokens (e.g. a distinct "raised card" background from "page background" in dark mode).
- **Dark mode exists** (`next-themes`, class-based) and is applied consistently, but is a direct
  color inversion throughout — dark mode gets no additional design attention (e.g. surfaces don't
  get the subtle elevation/glow treatment dark-mode-native products usually apply).

## 3. Design Direction / Principles

1. **Motion is purposeful, not decorative.** Spring-based (Framer Motion's default spring, which
   the poll ranking list already uses and which reads as "alive" rather than robotic linear
   easing), tied to real state changes (something opened, something was added/removed, a value
   changed) — not animation for its own sake. Respect `prefers-reduced-motion` throughout;
   whatever motion system gets built needs this from day one, not bolted on later.
2. **Depth over flatness.** Replace flat 1–2px borders with soft shadows and layered surface
   colors (a card sits *above* the page, not just outlined on it). Keep it subtle — the goal is
   startup-clean, not skeuomorphic.
3. **Respond to every interaction.** Every clickable thing gets a hover state, a focus-visible
   state, and ideally a press/active state. This is the single highest-leverage, lowest-risk
   change in this whole plan — it's mechanical (Tailwind utility classes), touches every
   component, and is the thing most responsible for "static" vs. "alive."
4. **Consistent elevation/spacing/radius scale**, defined once in `tailwind.config.js` and reused
   everywhere, rather than each component picking its own `rounded-md`/`rounded-lg`/shadow ad hoc
   (already inconsistent today — compare `Card.tsx`'s `rounded-md` to admin cards' `rounded-lg`).
5. **Dark mode as a first-class target**, not a color inversion afterthought — surfaces get their
   own elevation treatment in dark mode (subtle lighter layering or glow on raised elements)
   rather than just swapping gray-900 for white.

## 4. Proposed Phases

Ordered so each phase is independently shippable and reviewable — no phase requires a later one
to already exist. Phase ordering below is a proposal, not a decision — see §7.

### Phase -1 — Reference gathering
Before any tokens or mockups are drafted: look at the sites named as the design bar in §1 (Linear,
Vercel, Raycast, Anthropic's product surfaces) and pull back *concrete* patterns, not adjectives —
actual shadow/elevation values, spacing rhythm, motion timing/easing, radius scale, how accent
color gets used vs. primary. Feeds directly into Phase 0's token values and the Phase 1/2 mockups,
so both are grounded in real reference rather than descriptions like "soft shadows" or "springy."

**Findings (2026-08-18, text/structure-based research pass — visual/CSS inspection via browser
still pending, see below):**

Reference set expanded beyond the §1 big names to include smaller/indie sites specifically praised
for animation craft: [emilkowal.ski](https://emilkowal.ski) (Emil Kowalski, creator of `sonner`/
`vaul`) and [rauno.me](https://rauno.me) (Rauno Freiberg, Vercel) — plus Arc, Attio, and Cal.com as
small-team products with product-dashboard surface area closer to this app's admin/poll screens
than a marketing landing page.

*Concrete motion rules (from emilkowal.ski's animation essays — directly actionable for Phase 0/3):*
- UI animations should generally stay **under 300ms**; a 180ms transition reads as more responsive
  than 400ms for anything non-marketing.
- Use `ease-out` for elements entering/exiting (accelerates at the start, reads as responsive);
  avoid `ease-in` for UI work — it feels sluggish. Built-in CSS easings are often not enough;
  budget for 1-2 custom cubic-bezier curves as Phase 0 tokens.
- Button press feedback: a subtle `scale(0.97)` on press.
- Scale-in animations should start from `scale(0.9)`, never `scale(0)` — avoids the "popping out of
  nowhere" feel.
- High-frequency, keyboard-initiated actions (e.g. poll ranking reorder, admin table actions)
  should get little or no animation — motion on something used hundreds of times a day becomes
  friction, not delight. Directly relevant to Phase 3, which already touches the ranking list.
- Popover/dropdown-style elements should scale from their trigger point (CSS `transform-origin`),
  not the element center — relevant to any menu/dropdown added in Phase 1 (mobile nav) or Phase 3.
- `clip-path` is a hardware-accelerated alternative to animating `height`/`width` for reveal
  effects — no layout shift, no extra wrapper markup. Worth considering for Phase 3's toast
  enter/exit and any accordion-style admin UI.
- Overarching test before adding any animation: does it explain functionality, give spatial
  context, or (rarely) delight — if none of those, skip it. Reinforces principle 1 in §3.

*Visual/structural patterns (from Linear, Vercel, Raycast, Cal.com, Attio):*
- Dark/light mode is treated as two fully-designed states (paired asset variants), not a single
  inverted palette — reinforces principle 5 in §3.
- Modular, card-based section layout with consistent internal padding/spacing rhythm is close to
  universal across all of these — supports Phase 0's push for one reusable spacing/radius scale
  rather than per-component values.
- Raycast leans on glassmorphism (blurred translucent panels) as a dark-mode-native accent — a
  candidate treatment for elevated/raised surfaces in dark mode specifically (principle 5), not
  necessarily light mode.
- Attio's cards use clean borders *plus* layered information density rather than shadow alone —
  a reminder that "depth" (principle 2) doesn't have to mean heavy shadows; a light border +
  subtle background-tone shift reads as raised too, and cheaper to tune across light/dark.

*Gap:* this pass was text/structure-only (WebFetch), not visual — the Chrome extension needed for
actual screenshots and computed-style inspection (real shadow/blur values, actual easing curves,
color hex values) wasn't connected this session. Revisit with the browser tool once connected,
before finalizing Phase 0's exact token values.

### Phase 0 — Design foundations ✅ done (2026-08-18)
Extended `tailwind.config.js`: a real shadow/elevation scale, a consistent radius scale, transition
timing-function tokens, and a secondary accent color alongside the existing orange primary (see
§7.1). No visual changes ship in this phase — it's the vocabulary the rest of the plan draws from,
so later phases aren't inventing one-off values per component.

**What shipped:**
- `colors.accent` (Tailwind `indigo`) — also replaces the ad hoc `indigo.500` the typography plugin
  was already using for code color, so there's one deliberate non-primary hue instead of two.
- `boxShadow`: `card` / `raised` / `overlay`, each with a `-dark` counterpart tuned separately
  (lighter shadow + faint white hairline) rather than reusing light-mode values — a dark shadow
  barely reads against a dark background. `overlay` matches `PollSubmissionForm.tsx`'s existing
  `whileDrag` shadow value exactly, so that inline value can be swapped for the token later.
- `borderRadius`: semantic aliases `control` / `card` / `overlay` so components pick a role instead
  of an arbitrary `rounded-md`/`rounded-lg` per component (today's inconsistency, per §2).
- `transitionTimingFunction.out-expo` — the cubic-bezier "ease-out" curve from the Phase -1
  research, for anything entering/exiting.
- `lib/motion.ts` — shared Framer Motion constants: `springSnappy` (codifies the ranking list's
  existing `{stiffness: 500, damping: 35}` as the app-wide default spring, rather than each new
  animated component inventing its own feel), `springGentle` for larger surfaces, `easeOut` +
  `fadeScale` variants (scale-in from 0.9 per the Phase -1 research, not 0).
- Deliberately *not* built: a `prefers-reduced-motion` wrapper/abstraction. Framer Motion's
  built-in `useReducedMotion()` hook is enough at this app's scale — components that animate call
  it directly rather than routing through a custom layer.

### Phase 1 — Navigation & layout shell
`Header.tsx`, `Footer.tsx`, `MobileNav.tsx`, `SectionContainer.tsx`. Add hover/active states to
nav links, an active-route indicator, a smoother mobile nav open/close (currently instant —
candidate for a slide + backdrop-blur transition), and consistent focus-visible rings for
keyboard nav. Highest visibility per unit of effort, since this renders on every single page.

### Phase 2 — Content surfaces
`Card.tsx`, `PostLayout.tsx`/`PostSimple.tsx`/`PostBanner.tsx`, `ListLayout.tsx`,
`AuthorLayout.tsx`. Shadow/elevation instead of flat borders, hover lift + image scale on cards,
smoother pagination/list transitions.

**Images, folded into this phase** ✅ done (2026-08-23) — audited 2026-08-18 (every image already
renders through `next/image` via `components/Image.tsx`, no raw `<img>` tags, so this was
refinement, not a pipeline rebuild):
- Source files were oversized for their display size — several avatars were 500–900KB PNGs shown
  at 38–208px; press thumbnails ran up to 1.2MB. Resized (avatars to a 420px max dimension, 2x
  retina for the 208px League Members display size; thumbnails to a 1088px max width, 2x retina
  for the 544px `Card.tsx` display width) and converted PNG → JPEG at quality 82 — photos and
  screenshots compress far better as JPEG than PNG, and neither use case needs real transparency
  (the circular avatar crop is CSS, not image alpha). `players/` + `thumbnails/` combined:
  ~5.9MB → ~1.1MB. **Not** converted to `.webp` as originally planned here: `brew install webp`
  needs Xcode Command Line Tools, not available in the environment this shipped from, and
  `next/image`'s built-in optimizer already serves WebP/AVIF to supporting browsers at runtime
  regardless of source format (no `formats` override in `next.config.js`) — so static
  pre-conversion would have been a much smaller win than fixing the actually-oversized sources.
- Added `placeholder="blur"` (`next/image`'s built-in blur-up) to `Card.tsx` thumbnails and
  `AuthorLayout.tsx`/`PostLayout.tsx` avatars. Since these are referenced by dynamic string paths
  (MDX `avatar:` frontmatter, `projectsData.ts` `imgSrc`) rather than static imports, `next/image`
  can't auto-generate the blur data — generated tiny base64 placeholders from the actual source
  images instead, in `lib/blurPlaceholders.ts`.
- Replaced the generic `alt="avatar"` in `PostLayout.tsx` and `AuthorLayout.tsx` with the actual
  author's name.
- Storage stays in-repo (`public/static/images/`) — decided against moving to a bucket/CDN, since
  that's an infra addition outside this plan's non-goals (§6) and `next/image` already handles
  runtime optimization once source files are right-sized.

### Phase 3 — Admin & poll interactive surfaces ✅ done (2026-09-02, PR #49)
`PollWeekManager.tsx`, `app/admin/page.tsx`, `PollSubmissionForm.tsx`, `CommissionerPollClient.tsx`.

**What shipped:**
- Hand-built toast/notification component (`ToastProvider.tsx`, `useToast.ts`, per §7.4's
  decision) replacing `alert()`-based error handling in `PollWeekManager.tsx`
  (`handleUpdateDeadline`, `handleToggleLock`, `handleReopen`) with success + error toasts;
  `PollSubmissionForm.tsx` gets a success toast on ballot submission too.
- Loading skeleton (`PollTableSkeleton` in `CommissionerPollClient.tsx`) replacing a plain
  "Loading..." text, matching the real table's column shape.
- Highlight-in fade/color animation on newly created poll-week rows in `PollWeekManager.tsx`,
  scoped to genuinely new rows (not replayed on every unrelated refresh) via a `useRef`-tracked
  set of already-seen week IDs, written in a `useEffect` after commit (StrictMode-safe).
- The ranking list's existing drag-and-drop text-selection fix was independently improved in the
  same window (PR #46, ahead of this phase's own branch) — `select-none` hoisted to the parent
  `Reorder.Group` plus an `isDragging`-conditional hover-shadow suppression.

### Phase 4 — Page transitions & polish pass
Route-level transitions (Next.js `template.tsx` + Framer Motion `AnimatePresence`, or the
View Transitions API if browser support is judged sufficient by the time this phase starts),
button press states, a final consistency pass across everything shipped in Phases 1–3, and a
`prefers-reduced-motion` audit across all motion added in this plan.

## 5. Technical Approach

- **Framer Motion stays the motion library** — already a dependency, already proven in this
  codebase (the ranking list), no new dependency risk. Extend its usage rather than introducing a
  second animation library (e.g. GSAP) for consistency's sake.
- **Tailwind stays on v3.** A v3→v4 migration is a real, separate, riskier undertaking (breaking
  config format changes) and is explicitly out of scope here — this plan is additive to the
  existing Tailwind setup, not a framework migration.
- **No new component library** (Radix, shadcn/ui, Headless UI) is assumed by default — the app's
  component count is small enough that hand-built, Tailwind-styled components are still
  reasonable. Phase 3's toast component is hand-built (Tailwind + Framer Motion, see §7.4) rather
  than pulling in a library like `sonner`. Worth revisiting only if a later component (e.g. a
  modal/dialog) turns out to need more real accessibility complexity than that.

## 6. Non-Goals / Explicitly Out of Scope

- Rebranding (logo, name, fundamentally different color identity) — this is a *polish* pass on
  the existing identity, not a redesign of it.
- Tailwind v3 → v4 migration.
- Any change to page/content structure, information architecture, or the poll/admin feature set
  itself — this plan only touches how existing surfaces look and respond, not what they do.
- Backend/data changes of any kind.

## 7. Decisions

Resolved on 2026-08-18, prior to Phase 0 starting:

1. **Color system** — add a secondary accent color alongside the existing orange primary (plus a
   refined neutral scale). Orange stays the primary/CTA color; the accent (exact hue TBD in Phase
   0 — a muted blue or violet is the working assumption) handles secondary actions, links, and
   gradients/highlights. Rationale: a single-hue system caps how much hierarchy/depth the palette
   can express, which cuts against this plan's goal.
2. **Phase ordering** — kept as proposed: nav shell → content surfaces → admin/poll → page
   transitions. Optimizes for visibility-per-effort (Phase 1 renders on every page) over
   reordering around admin/poll despite that being the higher personal-usage surface.
3. **Mockups before code** — yes. Use the `design` skill to draft visual mockups for Phase 1/2
   before implementation starts, so review happens against real screens rather than text
   descriptions.
4. **Toast/notification component** (Phase 3) — hand-built with Tailwind + Framer Motion, no new
   dependency (`sonner` or similar considered and passed on). The app's scale doesn't warrant a
   library for a basic ARIA-live-region + auto-dismiss + small stack.

## 8. Fixed Outside the Phase Sequence

Found during the Phase -1/2 image audit (2026-08-18) — genuine bugs (broken asset references), not
styling, so fixed immediately rather than waiting on Phase 2:
- `siteMetadata.js` referenced a nonexistent `/static/images/logo.png` via an unused `siteLogo`
  field (dead — `Header.tsx` renders `data/logo.svg` directly, not this) — removed.
- `siteMetadata.socialBanner` was undefined despite being read as the default OG/Twitter image in
  `app/seo.tsx`, `app/layout.tsx`, and `app/newsfeed/[...slug]/page.tsx` — every page's fallback
  social-share image was broken. Now points to `/static/favicons/apple-touch-icon.png` as a
  stopgap (real file, but 180×180 square, not an ideal 1200×630 banner ratio) — **a proper social
  banner image is still worth designing**, flagged here rather than silently left as "good enough."
- 17 newsfeed posts had unmodified template-default `images: ['/static/images/twitter-card.png']`
  frontmatter pointing at a file that was never added to the repo — removed so they fall back to
  `socialBanner` correctly instead of resolving to a broken image.
- `week-nine-preview.mdx` referenced `players/kirk.png`; actual file is `kirk.jpeg` — fixed the
  extension.
