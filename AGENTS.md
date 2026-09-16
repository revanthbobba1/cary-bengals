# Repository instructions

This file is the canonical source for repository-specific agent instructions.

## Project context

Cary Bengals Fantasy Football is a Next.js 13.5 App Router site using TypeScript, Tailwind CSS,
Contentlayer, Supabase, and Netlify. Authors live in `data/authors/`; public articles, teams, and
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
- Create feature branches from `develop`.
- Open pull requests against `develop`, not `main`.
- Do not commit directly to `develop`.
- Keep changes focused and use separate pull requests for unrelated work.
- Run the relevant checks before opening a pull request.
