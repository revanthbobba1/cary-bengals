# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cary Bengals Fantasy Football — a league companion website providing weekly previews/recaps, press conference videos, commissioner power rankings, and league member profiles. Built on the [tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog) template.

## Commands

```bash
yarn dev              # Dev server at localhost:3000 (with cross-env)
yarn build            # Production build + post-build search index generation
yarn build:netlify    # Same as build, used by Netlify CI
yarn serve            # Start production server
yarn lint             # ESLint fix across pages, app, components, lib, layouts, scripts
```

No test framework is configured. There are no test commands.

## Architecture

**Framework:** Next.js 13.5 App Router, TypeScript, Tailwind CSS 3.3, deployed on Netlify (Node 18, Yarn 3.6.1).

**Content pipeline:** All content lives in `data/` as MDX files processed by [Contentlayer](https://www.contentlayer.dev/) at build time. Two document types are defined in `contentlayer.config.ts`:
- `Blog` — sourced from `data/newsfeed/**/*.mdx`, rendered via layouts in `layouts/`
- `Authors` — sourced from `data/authors/**/*.mdx`, used for league member profiles

Contentlayer generates typed objects importable from `contentlayer/generated`. A Kbar search index is written to `public/search.json` on each build via the `onSuccess` hook in `contentlayer.config.ts`.

**MDX processing chain:** remark-gfm → remark-math → remark-code-titles → rehype-slug → rehype-autolink-headings → rehype-katex → rehype-citation → rehype-prism-plus → rehype-preset-minify.

**Key data files (not MDX):**
- `data/siteMetadata.js` — central site config (title, URLs, analytics, comments, search, newsletter provider)
- `data/projectsData.ts` — press conference video entries (title, thumbnail, YouTube URL)
- `data/pollData.ts` — commissioner poll rankings keyed by `year → week → team[]`
- `data/headerNavLinks.ts` — navigation menu items

**Layouts vs Components:** `layouts/` contains page-level templates (`PostLayout`, `PostSimple`, `PostBanner`, `ListLayout`, `AuthorLayout`) that receive content props from route handlers in `app/`. `components/` contains reusable UI pieces. Client components (using React state/hooks) are marked with `'use client'` — notably `CommissionerPoll.tsx`, `MobileNav.tsx`, `ThemeSwitch.tsx`, `ListLayout.tsx`, `AuthListener.tsx`, and `AuthNav.tsx`.

**Pliny integration:** The [pliny](https://github.com/timlrx/pliny) package provides analytics wrappers (Umami), comment components (Giscus), newsletter forms, Kbar search, and MDX utility functions (`allCoreContent`, `sortPosts`, `coreContent`).

## Authentication

Supabase Auth gates `/admin` (email/password + Google OAuth). No self-registration — accounts are created only via Supabase Dashboard invite.

- `lib/supabase/client.ts` — browser client (`createBrowserClient`), used in `'use client'` components that react to live user actions: `app/login/page.tsx`, `app/set-password/page.tsx`, `components/AuthListener.tsx`, `lib/hooks/useAuth.ts`.
- `lib/supabase/server.ts` — server client (`createServerClient` + `next/headers` cookies), used in Server Components and Route Handlers: `app/admin/layout.tsx` (auth-gates the admin section before rendering), `app/auth/callback/route.ts` (exchanges the Google OAuth code for a session).
- `lib/supabase/middleware.ts` + root `middleware.ts` — refreshes the session and redirects unauthenticated visitors away from `/admin/:path*` at the edge, before any protected page renders. Server Components re-check `getUser()` independently as a second layer, since middleware can be bypassed in edge cases.
- Access control uses `app_metadata` roles (`"admin"`, `"commissioner"`). Every account gets `admin`, which grants access to `/admin`. `commissioner` is a separate, additive role (checked via `lib/supabase/roles.ts`'s `isCommissioner()`/`hasRole()`) gating poll administration specifically — managing poll weeks/teams, viewing all members' ballots, and overriding/deleting any member's submission (see `supabase/migrations/010_add_commissioner_role.sql` and RLS policies on `poll_weeks`/`teams`/`poll_results`/`poll_submissions`). Roles are assigned via Supabase Dashboard → Authentication → Users → App Metadata, e.g. `{ "roles": ["admin", "commissioner"] }`.
- Login failures return generic error messages (e.g. "Invalid email or password") to avoid user enumeration.

## Content Workflow

**New blog post:** Create `data/newsfeed/YYYY/post-slug.mdx` with frontmatter (`title` and `date` required). Reference authors by their filename in `data/authors/`. Set `draft: true` to hide from production.

**New press conference:** Add an entry to `data/projectsData.ts`.

**Update poll rankings:** Add week data to `data/pollData.ts` under the year key.

**New league member:** Create `data/authors/name.mdx` with frontmatter (`name` required, plus optional `avatar`, `team`, `email`, `twitter`, `linkedin`, `github`).

**New admin/member account:** Invite via the Supabase Dashboard (Authentication → Users). There is no in-app sign-up flow.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project connection (auth)
- `NEXT_UMAMI_ID` — Umami analytics site ID
- Giscus comments: `GISCUS_REPO`, `REPOSITORY_ID`, `CATEGORY`, `CATEGORY_ID`
- Newsletter provider keys are optional (Mailchimp, Buttondown, Convertkit, Klaviyo, Emailoctopus)

## Conventions

- Tailwind primary color is orange; font is Space Grotesk; dark mode is class-based via `next-themes`.
- Pre-commit hooks (Husky + lint-staged) run ESLint fix and Prettier on staged files.
- Blog post slugs are derived from the file path under `data/newsfeed/` with the leading directory stripped.
- Three post layout options: `PostLayout` (default, two-column with author sidebar), `PostSimple`, `PostBanner`.
- Security headers (CSP, HSTS, X-Frame-Options) are configured in `next.config.js`. Update the CSP if adding new external script/image domains.

## Git Workflow

- All changes go on a feature branch off `main` and land via a pull request — no direct commits to `main`.
- PR review, findings handling, thread resolution, and post-merge cleanup follow the
  `pr-review-workflow` personal skill (same process across all my projects, not specific to this repo).
