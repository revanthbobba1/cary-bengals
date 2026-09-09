# Resolved: client-side navigation gets stuck

**Status:** Root-caused and fixed. The cause was **application code**, not Netlify and not Next.js.

**Discovered:** 2026-09-09, immediately after deploying the Articles feature to production.
**Fixed:** 2026-09-09, in `components/PageTransition.tsx`.

## Symptom

Clicking a main nav link did nothing: the page content never changed, the URL never changed, no
error appeared, and the Network tab filled with hundreds of identical requests to the target route
(the same `?_rsc=` token repeated) each returning `304`. Typing the URL directly always worked.

## Root cause

`components/PageTransition.tsx` wrapped the root layout's `{children}` in framer-motion's
`<AnimatePresence mode="wait">`.

In the App Router, that `{children}` is a `<LayoutRouter>`. On a client-side navigation it
**suspends** while fetching the next segment's RSC payload. `AnimatePresence` is not Suspense-aware:
with `mode="wait"` it owns its children's mount/unmount lifecycle and re-creates the subtree on each
of React's retry renders. So the suspended router never resumed — it remounted, discarded the
in-flight cache node, and issued a fresh `fetchServerResponse`, forever. Because the navigation
transition never committed, the URL never updated either.

The exit animation could never have worked as designed regardless: `usePathname()` only changes
_after_ the navigation transition commits, so `key={pathname}` was still the old value for the
entire time an exit animation would have had to run.

## Fix

Made the transition **enter-only** and removed `AnimatePresence` from the router's children. A plain
`motion.div` is just a div with a ref — it holds no state across a suspension, so the router
suspends and resumes normally. The fade-in on arrival, which is what actually rendered before, is
unchanged. `AnimatePresence` elsewhere (`components/ToastProvider.tsx`) is fine — it wraps toasts,
not the router.

## What the earlier investigation got wrong, and why

The first pass concluded this was
[netlify/next-runtime#2089](https://github.com/netlify/next-runtime/issues/2089) — a Next.js/Netlify
adapter bug. It matched the public symptom description closely (stuck nav, tight `_rsc` retry loop),
and every server-side check came back clean, which made a hosting-layer problem look like the only
remaining explanation.

Two checks would have caught it immediately, and are the ones to reach for next time:

1. **Reproduce against `yarn build && npx next start` locally.** The bug reproduces identically with
   no Netlify involved. This single step falsifies every hosting-layer theory in about two minutes.
2. **Read the RSC response body, not just the status code.** The `304`s were ordinary revalidation
   (`cache-control: public,max-age=0,must-revalidate`) and were a red herring. The server was
   serving a correct, statically prerendered flight payload (`cache-status: "Next.js"; hit`) with
   correct `Vary` headers the whole time — so the loop had to be the client failing to consume a
   good response, which points at the client tree, i.e. app code.

The `/previews-recaps` → `/articles` rename was blamed as the trigger. It was a coincidence: the bug
was latent from PR #52 (which added `PageTransition`) and reproduces on routes that rename never
touched.

## Follow-ups shipped alongside the fix

Two other client-navigation defects found while reviewing this area:

**Mobile menu survived a route change.** `MobileNav` toggled `navShow` and `document.body.style.overflow`
only from its own click handlers, so a browser Back/Forward while the sheet was open left the menu
covering the new page with the body still scroll-locked — escapable only by tapping the X. The scroll
lock is now driven off `navShow` in an effect (so React restores the previous value on close _and_ on
unmount), and a second effect closes the sheet whenever `usePathname()` changes.

**`scroll-smooth` moved off `<html>`.** The global class put `scroll-behavior: smooth` on the document
scroller, which is the same scroller Next.js drives for scroll restoration and the scroll-to-top on
every navigation; it also had no `prefers-reduced-motion` guard. Smooth scrolling is now requested
per-jump by `components/SmoothHashScroll.tsx` for same-page `#hash` links only, and honours reduced
motion. Note the browser used for testing has smooth scrolling disabled entirely (`behavior: 'smooth'`
is a no-op there while `'auto'` works), so the _user-visible_ impact on scroll restoration was not
something that session could measure either way — the change is motivated by scoping and by the
reduced-motion gap, not by a reproduced restoration bug.
