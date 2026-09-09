# Known issue: client-side navigation gets stuck on the live site

**Status:** Unresolved, unfixed. Deferred to a dedicated session — deliberately kept out of
`docs/PREVIEWS_RECAPS_PLAN.md` since this is a routing/hosting-platform problem, not part of that
feature's content or scope.

**Discovered:** 2026-09-09, immediately after merging `develop` → `main` and deploying the
Articles feature (`docs/PREVIEWS_RECAPS_PLAN.md`) to production on Netlify.

## Symptom

On the live site (`cary-bengals.netlify.app`), clicking a nav link (e.g. "Articles", "Press
Conferences") sometimes does nothing — the page content never changes, no error is shown, and the
browser Network tab shows either a single stuck request or, in one observed case, **1000+ requests
to the identical URL** (same `?_rsc=` token repeated) each returning `304 Not Modified`, over
roughly a minute, before the user gave up. A hard refresh / typing the URL directly always works.

## Root cause: NOT the article feature's code

This is client-side navigation failing, not a data or rendering bug:

- **Reproduces on routes untouched by this session's work** — `/poll` → `/conferences`,
  `/league-members`. Neither was touched by any of PRs #61–#64.
- **Reproduces in a brand-new browser session with zero prior cache/history.** Ruled out: stale
  browser tab holding an old JS bundle from before the deploy.
- **Hard navigation (full page load) always works correctly.** The server-side rendering, RSC
  payload generation, and Supabase data fetching are all fine — confirmed by fetching the raw RSC
  payload for `/articles` directly (`curl` with `RSC: 1` header) and finding valid, correct content
  (season pills, article titles, etc.), and by loading every affected route via a fresh full-page
  navigation without issue.
- **"Deploy without cache" (Netlify's cache-clear + redeploy) did not fix it.** This rules out a
  wedged/corrupted CDN cache entry as the sole cause (an early theory, based on `curl` without
  browser headers getting an invalid unconditional 304 for `/` — that turned out to be a red
  herring / artifact of repeated testing, not the real mechanism, since the bug persists after a
  full cache clear and in sessions that never hit that cached entry).
- **Matches a known, long-documented bug class**: Next.js App Router client-side navigation
  hanging or infinitely retrying on Netlify, tracked publicly at
  [netlify/next-runtime#2089](https://github.com/netlify/next-runtime/issues/2089) (closed after
  Netlify's Next.js Runtime v5 release, which is what this project already uses —
  `@netlify/plugin-nextjs: ^5.14.3` — yet the symptom still reproduces here). Community reports
  describe the same failure signature: a route-tree/segment mismatch between what the client
  router expects and what the server serves, causing either a silent stuck navigation or a tight
  retry loop (matching the "same `_rsc` token repeated 1000+ times" observation exactly).

**Stack:** `next: 13.5.3` (released Sept 2023), `@netlify/plugin-nextjs: ^5.14.3`, `react: 18.2.0`.

## Why this deploy likely triggered it (even though the bug itself isn't a code mistake)

The bug is latent in the framework/adapter combination, not something introduced by writing wrong
application code. But it wasn't happening before today, and something had to newly expose it.

The most likely trigger is the `/previews-recaps` → `/articles` rename (`docs/PREVIEWS_RECAPS_PLAN.md`
§7.1, decided 2026-09-08): deleting one whole route subtree
(`app/previews-recaps/[...slug]/page.tsx`) and adding a differently-shaped one
(`app/articles/[...slug]/page.tsx`, plus the new `app/admin/articles/[id]/preview/page.tsx`)
reshapes the app's route manifest in exactly the way the known bug class is triggered by (a
mismatch between the client's cached idea of the route tree and the server's actual one). That's
circumstantial, not proven — no next.config.js, middleware.ts, or root layout change happened
today (verified via `git log` across all of today's commits) that would otherwise explain a
site-wide routing regression.

What it does **not** mean: this isn't scoped to the renamed pages. Once triggered, the failure
affects client-side navigation to arbitrary routes (`/poll`, `/league-members` included), so it's
not something fixable by, say, adding a redirect from the old URL.

## Candidate fixes (not yet applied — needs a decision, not a unilateral fix)

In order of cost/risk:

1. **Force full-page navigation on the main header nav** (swap `Header.tsx`'s `<Link>`s for plain
   `<a>` tags). Cheapest, guaranteed-correct since hard nav always works. Costs the SPA-style
   instant transition on those specific links; other in-page links can stay as `<Link>`.
2. **Disable prefetch on nav links first** (`prefetch={false}`) as a lower-confidence, lower-cost
   first attempt — may reduce frequency without guaranteeing a fix, since community reports say
   prefetch isn't the only trigger.
3. **Upgrade Next.js** past 13.5.3 — a later 13.x or 14.x release may include the actual fix
   referenced in the GitHub issue. Biggest change, real regression risk across the whole app
   (this is a large template-derived site), needs thorough testing. Not something to do casually.
4. **Move hosting off Netlify** (e.g. to Vercel, Next.js's native host) — several people in the
   GitHub issue reported this as their actual fix, since it removes the adapter-translation layer
   entirely. A real operational decision (redoing the deploy pipeline), not a code change.

## Reproduction steps

1. Open `https://cary-bengals.netlify.app/` in a fresh browser session (or any page).
2. Click any main nav link (Articles, Press Conferences, Commissioner's Poll, League Members).
3. Observe: page content doesn't change; Network tab shows a request to the target route (often
   with a `?_rsc=` query param) that either hangs or repeats identically many times, each
   returning `304`.
4. Confirm it's not a dead end: type the same URL directly into the address bar (hard navigation)
   — it loads correctly every time.
