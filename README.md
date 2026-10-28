# Cary Bengals Tailwind Nextjs Starter Blog

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/timlrx/tailwind-nextjs-starter-blog)

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

Two services are configured but optional, enabled only if their env vars are set in Netlify:
**Umami** (self-hosted analytics, `NEXT_UMAMI_ID`) and **Giscus** (GitHub Discussions-backed
comments, `NEXT_PUBLIC_GISCUS_*`) — see `data/siteMetadata.js`.

This is a [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/) app (App Router, React Server Components) backed by Supabase.

Probably the most feature-rich Next.js markdown blogging template out there. Easily configurable and customizable. Perfect as a replacement to existing Jekyll and Hugo individual blogs.

Check out the documentation below to get started.

Facing issues? Check the [FAQ page](https://github.com/timlrx/tailwind-nextjs-starter-blog/wiki) and do a search on past issues. Feel free to open a new issue if none has been posted previously.

Looking for an Astro alternative? Check out the unofficial [Tailwind Astro Template](https://github.com/wanoo21/tailwind-astro-starting-blog).

## Motivation

I wanted to port my existing blog to Nextjs and Tailwind CSS but there was no easy out of the box template to use so I decided to create one. Design is adapted from [Tailwindlabs blog](https://github.com/tailwindlabs/blog.tailwindcss.com).

I wanted it to be nearly as feature-rich as popular blogging templates like [beautiful-jekyll](https://github.com/daattali/beautiful-jekyll) and [Hugo Academic](https://github.com/wowchemy/wowchemy-hugo-modules) but with the best of React's ecosystem and current web development's best practices.

## Features

- Next.js with Typescript
- Easy styling customization with [Tailwind 3.0](https://tailwindcss.com/blog/tailwindcss-v3) and primary color attribute
- Near perfect lighthouse score - [Lighthouse report](https://www.webpagetest.org/result/230805_BiDcBQ_4H7)
- Lightweight, 85kB first load JS
- Mobile-friendly view
- Light and dark theme
- Font optimization with [next/font](https://nextjs.org/docs/app/api-reference/components/font)
- Integration with [pliny](https://github.com/timlrx/pliny) that provides:
  - Multiple analytics options including [Umami](https://umami.is/), [Plausible](https://plausible.io/), [Simple Analytics](https://simpleanalytics.com/), Posthog and Google Analytics
  - Comments via [Giscus](https://github.com/laymonage/giscus), [Utterances](https://github.com/utterance/utterances) or Disqus
  - Newsletter API and component with support for Mailchimp, Buttondown, Convertkit, Klaviyo, Revue, and Emailoctopus
  - Command palette search with [Kbar](https://github.com/timc1/kbar) or Algolia
- Server-side syntax highlighting with line numbers and line highlighting via [rehype-prism-plus](https://github.com/timlrx/rehype-prism-plus)
- Math display supported via [KaTeX](https://katex.org/)
- Citation and bibliography support via [rehype-citation](https://github.com/timlrx/rehype-citation)
- Automatic image optimization via [next/image](https://nextjs.org/docs/basic-features/image-optimization)
- Support for tags - each unique tag will be its own page
- 3 different blog layouts
- 2 different blog listing layouts
- Support for nested routing of blog posts
- Projects page
- Preconfigured security headers
- SEO friendly with RSS feed, sitemaps and more!

## Quick Start Guide

1. Personalize `siteMetadata.js` (site related information)
2. Modify the content security policy in `next.config.js` if you want to use
   other analytics provider or a commenting solution other than giscus.
3. Personalize `authors/default.md` (main author)
4. Modify `projectsData.js`
5. Modify `headerNavLinks.js` to customize navigation links
6. Add blog posts
7. Deploy on Vercel

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

`data/authors/default.md` - default author information (required). Additional authors can be added as files in `data/authors`.

`data/projectsData.js` - data used to generate styled card on the projects page.

`data/headerNavLinks.js` - navigation links.

`data/logo.svg` - replace with your own logo.

`data/blog` - replace with your own blog posts.

`public/static` - store assets such as images and favicons.

`tailwind.config.js` and `css/tailwind.css` - tailwind configuration and stylesheet which can be modified to change the overall look and feel of the site.

`css/prism.css` - controls the styles associated with the code blocks. Feel free to customize it and use your preferred prismjs theme e.g. [prism themes](https://github.com/PrismJS/prism-themes).

`data/members.ts` - league member profiles (name, avatar, social links); add an entry to add a member.

`layouts` - page-level templates (currently `MemberLayout` for `/league-members`).

`app` - pages to route to. Read the [Next.js documentation](https://nextjs.org/docs/app) for more information.

`next.config.js` - configuration related to Next.js. You need to adapt the Content Security Policy if you want to load scripts, images etc. from other domains.

## Deploy

**Vercel**  
The easiest way to deploy the template is to deploy on [Vercel](https://vercel.com). Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

**Netlify**
[Netlify](https://www.netlify.com/)’s Next.js runtime configures enables key Next.js functionality on your website without the need for additional configurations. Netlify generates serverless functions that will handle Next.js functionalities such as server-side rendered (SSR) pages, incremental static regeneration (ISR), `next/images`, etc.

See [Next.js on Netlify](https://docs.netlify.com/integrations/frameworks/next-js/overview/#next-js-runtime) for suggested configuration values and more details.

**Static hosting services / GitHub Pages / S3 / Firebase etc.**

1. Add `output: 'export'` in `next.config.js`. See [static exports documentation](https://nextjs.org/docs/app/building-your-application/deploying/static-exports#configuration) for more information.
2. Comment out `headers()` from `next.config.js`.
3. Change `components/Image.tsx` to use a standard `<img>` tag instead of `next/image`:

   ```ts
   /* eslint-disable jsx-a11y/alt-text */
   /* eslint-disable @next/next/no-img-element */
   import NextImage, { ImageProps } from 'next/image'

   // @ts-ignore
   const Image = ({ ...rest }: ImageProps) => <img {...rest} />

   export default Image
   ```

   Alternatively, to continue using `next/image`, you can use an alternative image optimization provider such as Imgix, Cloudinary or Akamai. See [image optimization documentation](https://nextjs.org/docs/app/building-your-application/deploying/static-exports#image-optimization) for more details.

4. Remove `api` folder and components which call the server-side function such as the Newsletter component. Not technically required and the site will build successfully, but the APIs cannot be used as they are server-side functions.
5. Run `yarn build`. The generated static content is in the `out` folder.
6. Deploy the `out` folder to your hosting service of choice or run `npx serve out` to view the website locally.

## Support

Using the template? Support this effort by giving a star on GitHub, sharing your own blog and giving a shoutout on Twitter or becoming a project [sponsor](https://github.com/sponsors/timlrx).

## Licence

[MIT](https://github.com/timlrx/tailwind-nextjs-starter-blog/blob/main/LICENSE) © [Timothy Lin](https://www.timlrx.com)
