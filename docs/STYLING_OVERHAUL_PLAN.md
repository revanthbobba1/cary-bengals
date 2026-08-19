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

### Phase 0 — Design foundations
Extend `tailwind.config.js`: a real shadow/elevation scale, a consistent radius scale, transition
timing-function tokens, and (pending §7's open question) either a refined neutral scale or a
secondary accent color alongside the existing orange primary. No visual changes ship in this
phase — it's the vocabulary the rest of the plan draws from, so later phases aren't inventing
one-off values per component.

### Phase 1 — Navigation & layout shell
`Header.tsx`, `Footer.tsx`, `MobileNav.tsx`, `SectionContainer.tsx`. Add hover/active states to
nav links, an active-route indicator, a smoother mobile nav open/close (currently instant —
candidate for a slide + backdrop-blur transition), and consistent focus-visible rings for
keyboard nav. Highest visibility per unit of effort, since this renders on every single page.

### Phase 2 — Content surfaces
`Card.tsx`, `PostLayout.tsx`/`PostSimple.tsx`/`PostBanner.tsx`, `ListLayout.tsx`,
`AuthorLayout.tsx`. Shadow/elevation instead of flat borders, hover lift + image scale on cards,
smoother pagination/list transitions.

### Phase 3 — Admin & poll interactive surfaces
`PollWeekManager.tsx`, `app/admin/page.tsx`, `PollSubmissionForm.tsx`. Extend the motion language
already established by the ranking list's drag-and-drop to the rest of these surfaces: animated
list insert/remove where poll weeks or status rows appear, loading skeletons instead of blank
gaps during `router.refresh()`, and — the most concrete, most worth calling out separately —
**replace `alert()`-based error handling** (`handleUpdateDeadline`, `handleToggleLock` in
`PollWeekManager.tsx`) with an in-app toast/notification component. This alone is a significant
"feels modern" signal, independent of anything else in this plan.

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
  reasonable. Worth revisiting only if Phase 3's toast component (or anything with real
  accessibility complexity, like a modal/dialog) turns out to need more than a light custom
  implementation — flagged as a §7 open question, not decided here.

## 6. Non-Goals / Explicitly Out of Scope

- Rebranding (logo, name, fundamentally different color identity) — this is a *polish* pass on
  the existing identity, not a redesign of it.
- Tailwind v3 → v4 migration.
- Any change to page/content structure, information architecture, or the poll/admin feature set
  itself — this plan only touches how existing surfaces look and respond, not what they do.
- Backend/data changes of any kind.

## 7. Open Questions

Things this doc deliberately leaves undecided, to settle with you before Phase 0 starts:

1. **Color system** — keep orange as the sole primary with a refined neutral scale, or introduce
   a secondary accent (e.g. for gradients/highlights) alongside it?
2. **Phase ordering** — is the proposed order (nav shell → content → admin/poll → transitions)
   right, or does the admin/poll experience (where you personally spend the most time) deserve to
   move earlier?
3. **Mockups before code** — worth using the `design` skill to draft actual visual mockups for
   Phase 1/2 first, so you're reacting to real screens rather than text descriptions, before any
   implementation starts? (Recommended — cheap relative to redoing implemented UI after the fact.)
4. **Toast/notification component** (Phase 3) — hand-built and Tailwind-styled, or worth pulling
   in a small focused library (e.g. `sonner`) rather than building accessible toast semantics
   (ARIA live regions, auto-dismiss timing, stacking) from scratch?
