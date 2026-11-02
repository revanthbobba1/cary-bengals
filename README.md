# Cary Bengals Fantasy Football

## External services this app depends on

This is a quick map of everything the live site depends on outside this repo — where it's
deployed, what each piece is for, and how they connect. See `AGENTS.md` for the full
repository-instructions version of this (env vars, commands, conventions); this section is the
plain-English overview for anyone new to the project.

| Service                  | What's deployed there                                | Why                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Netlify**              | The Next.js app itself (this repo, `yarn build`)     | Hosting + CI deploy target. Builds from `main` on every push; Node 18, Yarn 3.6.1, Next.js runtime plugin (`netlify.toml`).                                                                       |
| **Supabase**             | Postgres DB, Auth, Row-Level Security, RPC functions | Single source of truth for teams, poll data/weeks, articles, and ESPN-synced team/roster data. Also gates `/admin` login.                                                                         |
| **Google Cloud Console** | OAuth 2.0 Client (Web application)                   | Lets commissioners/admins sign in with "Sign in with Google" on `/login`. The Client ID/Secret live in Supabase's Google Auth provider config, not in this repo or Netlify.                       |
| **Render**               | `backend/` — a small FastAPI service (Docker)        | Fetches and sanitizes data from ESPN's Fantasy Football API using the commissioner's ESPN cookies, which must never reach the browser or a public page. Free tier; cold-starts after ~15min idle. |
| **ESPN Fantasy API**     | Nothing — external, read-only, unofficial            | The actual source of team/roster data. Undocumented, cookie-authenticated; only the Render service ever talks to it directly (see `docs/ESPN_INTEGRATION_PLAN.md`).                               |
| **GitHub Actions**       | CI only (`.github/workflows/ci.yml`)                 | Runs `yarn lint && yarn build` (frontend) and `ruff`/`black`/`pytest` (backend) on every PR against `develop`/`main`.                                                                             |

**How a request actually flows**, end to end, for the ESPN-backed features:
commissioner clicks "Refresh ESPN Data" in `/admin/commissioner` → a Next.js Server Action calls
the Render service with a shared secret (`ESPN_SERVICE_TOKEN`) → Render calls ESPN with the
commissioner's cookies → Render sanitizes the response and returns it → the Server Action writes
it into Supabase → public pages (e.g. `/league-members`) read only from Supabase, never from
Render or ESPN directly.

**Umami** (self-hosted analytics, `NEXT_UMAMI_ID`) is configured but optional, enabled only if
its env var is set in Netlify — see `data/siteMetadata.js`.

This is a [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/) app (App Router, React Server Components) backed by Supabase.

## Installation

```bash
yarn
```

## Development

First, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Edit the layout in `app` or content in `data`. With live reloading, the pages auto-updates as you edit them.

## Extend / Customize

`data/siteMetadata.js` - contains most of the site related information which should be modified for a user's need.

`data/headerNavLinks.ts` - navigation links.

`data/logo.svg` - site logo.

`public/static` - store assets such as images and favicons.

`tailwind.config.js` and `css/tailwind.css` - tailwind configuration and stylesheet which can be modified to change the overall look and feel of the site.

`data/members.ts` - league member profiles (name, avatar, social links); add an entry to add a member. Press conferences and articles live in Supabase, not in files.

`layouts` - page-level templates (currently `MemberLayout` for `/league-members`).

`app` - pages to route to. Read the [Next.js documentation](https://nextjs.org/docs/app) for more information.

`next.config.js` - configuration related to Next.js. You need to adapt the Content Security Policy if you want to load scripts, images etc. from other domains.

## Deploy

The app deploys to Netlify from `main` (see `netlify.toml` and `docs/NETLIFY_DEPLOYMENT.md`). It
relies on server-rendered pages, Route Handlers, and Server Actions, so it can't be exported as a
static site.

## Licence

Built from the [tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog) template.

[MIT](https://github.com/timlrx/tailwind-nextjs-starter-blog/blob/main/LICENSE) © [Timothy Lin](https://www.timlrx.com)
