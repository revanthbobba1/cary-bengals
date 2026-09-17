# Repository instructions

This file is the canonical source for repository-specific agent instructions.

## Project context

Cary Bengals Fantasy Football is a Next.js 13.5 App Router site using TypeScript, Tailwind CSS,
Contentlayer, Supabase, and Netlify. Authors live in `data/authors/`. public articles, teams, and
poll data are Supabase-backed. The ESPN service in `backend/` securely fetches team metadata;
public pages must never call ESPN directly or expose ESPN credentials.

## Commands

```bash
yarn dev
yarn build
yarn build:netlify
yarn serve
yarn lint
```

There is no JavaScript test framework. ESPN backend tests live under `backend/tests/`.

## Data and authentication

Supabase Auth gates `/admin`; accounts are invited through the Supabase Dashboard. The
`commissioner` role controls poll administration and ESPN team synchronization. Current poll
rankings and team metadata are stored in Supabase; legacy `data/pollData.ts` is not the current
source of truth.

Required/optional environment variables include `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional analytics/comments/newsletter values, and server-only
`ESPN_SERVICE_URL`/`ESPN_SERVICE_TOKEN`. Never commit secrets, local environment files, ESPN
cookies, or service tokens.

## Conventions

Tailwind uses orange as the primary color and Space Grotesk as the font. Husky and lint-staged
format and lint staged files. Update `next.config.js` CSP rules when adding external assets.

## Detailed architecture

Contentlayer processes author MDX files under `data/authors/` at build time. Generated types are
available from `contentlayer/generated`. `layouts/` contains page-level templates, while
`components/` contains reusable UI pieces. Client components use the `'use client'` directive.

Pliny provides analytics wrappers, comments, newsletter components, command-palette search, and
content utilities. The main configuration files are:

- `data/siteMetadata.js` — site title, URLs, analytics, comments, search, and newsletter settings
- `data/projectsData.ts` — press conference entries
- `data/headerNavLinks.ts` — navigation items
- `contentlayer.config.ts` — MDX processing and document definitions
- `css/tailwind.css` and `tailwind.config.js` — application styling

## Authentication details

- `lib/supabase/client.ts` is the browser client for interactive authenticated components.
- `lib/supabase/server.ts` is the server client for Server Components and Route Handlers.
- `lib/supabase/middleware.ts` and `middleware.ts` refresh sessions and protect `/admin` routes.
- `app/auth/callback/route.ts` exchanges the Google OAuth code for a session.

There is no self-registration; accounts are invited through Supabase Dashboard → Authentication →
Users. Access uses `app_metadata` roles. `admin` grants `/admin` access, while `commissioner` is a
separate role for poll administration, member ballot visibility, team management, and ESPN sync.
Login failures should remain generic to avoid user enumeration.

## Content workflows

- New league members are author files under `data/authors/` with required `name` and optional
  `avatar`, `team`, `email`, `twitter`, `linkedin`, and `github` fields.
- Press conference entries belong in `data/projectsData.ts`.
- Current poll rankings and team metadata belong in Supabase; do not treat legacy
  `data/pollData.ts` as the current poll source of truth.
- New article work belongs in the Supabase-backed article workflow and should preserve stable
  article slugs and team IDs.

## Build and review notes

- The production build also generates the search index through Contentlayer.
- Netlify uses Node 18, Yarn 3.6.1, and the Next.js runtime plugin.
- Pre-commit hooks run ESLint and Prettier on staged files.
- There is no JavaScript test framework; run targeted TypeScript/ESLint checks and backend tests
  when relevant.
- Update CSP rules when adding external scripts, images, comments, analytics, or API domains.
- Create feature branches from `develop`.
- Open pull requests against `develop`, not `main`.
- Do not commit directly to `develop`.
- Keep changes focused and use separate pull requests for unrelated work.
- Run the relevant checks before opening a pull request.
