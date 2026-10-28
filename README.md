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

Two services are configured but optional, enabled only if their env vars are set in Netlify:
**Umami** (self-hosted analytics, `NEXT_UMAMI_ID`) and **Giscus** (GitHub Discussions-backed
comments, `NEXT_PUBLIC_GISCUS_*`) — see `data/siteMetadata.js`.

This is a [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/) blogging starter template. Version 2 is based on Next App directory with [React Server Component](https://nextjs.org/docs/getting-started/react-essentials#server-components) and uses [Contentlayer](https://www.contentlayer.dev/) to manage markdown content.

Probably the most feature-rich Next.js markdown blogging template out there. Easily configurable and customizable. Perfect as a replacement to existing Jekyll and Hugo individual blogs.

Check out the documentation below to get started.

Looking for an Astro alternative? Check out the unofficial [Tailwind Astro Template](https://github.com/wanoo21/tailwind-astro-starting-blog).

## Motivation

I wanted to port my existing blog to Nextjs and Tailwind CSS but there was no easy out of the box template to use so I decided to create one. Design is adapted from [Tailwindlabs blog](https://github.com/tailwindlabs/blog.tailwindcss.com).

I wanted it to be nearly as feature-rich as popular blogging templates like [beautiful-jekyll](https://github.com/daattali/beautiful-jekyll) and [Hugo Academic](https://github.com/wowchemy/wowchemy-hugo-modules) but with the best of React's ecosystem and current web development's best practices.

## Features

- Next.js with Typescript
- [Contentlayer](https://www.contentlayer.dev/) to manage content logic
- Easy styling customization with [Tailwind 3.0](https://tailwindcss.com/blog/tailwindcss-v3) and primary color attribute
- [MDX - write JSX in markdown documents!](https://mdxjs.com/)
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
- Support for multiple authors
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
3. Add league members as files in `data/members/`
4. Modify `headerNavLinks.ts` to customize navigation links
5. Add articles through the Supabase-backed article workflow (see `AGENTS.md`)
6. Deploy on Netlify

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

`data/members/` - one file per league member. Press conferences and articles live in Supabase, not in files.

`data/headerNavLinks.ts` - navigation links.

`data/logo.svg` - site logo.

`public/static` - store assets such as images and favicons.

`tailwind.config.js` and `css/tailwind.css` - tailwind configuration and stylesheet which can be modified to change the overall look and feel of the site.

`css/prism.css` - controls the styles associated with the code blocks. Feel free to customize it and use your preferred prismjs theme e.g. [prism themes](https://github.com/PrismJS/prism-themes).

`contentlayer.config.ts` - configuration for Contentlayer, including definition of content sources and MDX plugins used. See [Contentlayer documentation](https://www.contentlayer.dev/docs/getting-started) for more information.

`components/MDXComponents.js` - pass your own JSX code or React component by specifying it over here. You can then use them directly in the `.mdx` or `.md` file. By default, a custom link, `next/image` component, table of contents component and Newsletter form are passed down. Note that the components should be default exported to avoid [existing issues with Next.js](https://github.com/vercel/next.js/issues/51593).

`layouts` - main templates used in pages:

- There are currently 3 post layouts available: `PostLayout`, `PostSimple` and `PostBanner`. `PostLayout` is the default 2 column layout with meta and author information. `PostSimple` is a simplified version of `PostLayout`, while `PostBanner` features a banner image.
- There are 2 blog listing layouts: `ListLayout`, the layout used in version 1 of the template with a search bar and `ListLayoutWithTags`, currently used in version 2, which omits the search bar but includes a sidebar with information on the tags.

`app` - pages to route to. Read the [Next.js documentation](https://nextjs.org/docs/app) for more information.

`next.config.js` - configuration related to Next.js. You need to adapt the Content Security Policy if you want to load scripts, images etc. from other domains.

## Post

Content is modelled using [Contentlayer](https://www.contentlayer.dev/), which allows you to define your own content schema and use it to generate typed content objects. See [Contentlayer documentation](https://www.contentlayer.dev/docs/getting-started) for more information.

### Frontmatter

Frontmatter follows [Hugo's standards](https://gohugo.io/content-management/front-matter/).

Please refer to `contentlayer.config.ts` for an up to date list of supported fields. The following fields are supported:

```
title (required)
date (required)
tags (optional)
lastmod (optional)
draft (optional)
summary (optional)
images (optional)
authors (optional list which should correspond to the file names in `data/members`)
layout (optional list which should correspond to the file names in `data/layouts`)
canonicalUrl (optional, canonical url for the post for SEO)
```

Here's an example of a post's frontmatter:

```
---
title: 'Introducing Tailwind Nexjs Starter Blog'
date: '2021-01-12'
lastmod: '2021-01-18'
tags: ['next-js', 'tailwind', 'guide']
draft: false
summary: 'Looking for a performant, out of the box template, with all the best in web technology to support your blogging needs? Checkout the Tailwind Nextjs Starter Blog template.'
images: ['/static/images/canada/mountains.jpg', '/static/images/canada/toronto.jpg']
authors: ['default', 'sparrowhawk']
layout: PostLayout
canonicalUrl: https://cary-bengals.netlify.app/articles/introducing-tailwind-nextjs-starter-blog
---
```

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

## Frequently Asked Questions

### How can I add a custom MDX component?

Here's an example on how to create a donut chart from Chart.js (assuming you already have the dependencies installed) and use it in MDX posts. First, create a new `DonutChart.tsx` component in `components`:

```tsx
'use client'

import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const DonutChart = ({ data }) => {
  return <Doughnut data={data} />
}

export default Doughnut
```

Since the underlying `Doughnut` component uses React hooks, we add the `'use client'` directive to specify that it is a client side component. Also, there is an existing issue which prevents named components from being used, so we need to export the component as the default export.

Next, add the component to `MDXComponents.tsx`:

```diff
...
+ import DonutChart from './DonutChart'

export const components: MDXComponents = {
  Image,
  TOCInline,
  a: CustomLink,
  pre: Pre,
+  DonutChart,
  BlogNewsletterForm,
}
```

You can now use the component in `.mdx` files:

```mdx
## Example Donut Chart

export const data = {
  labels: ['Red', 'Blue', 'Yellow'],
  datasets: [
    {
      label: '# of Votes',
      data: [12, 19, 3],
      backgroundColor: [
        'rgba(255, 99, 132, 0.2)',
        'rgba(54, 162, 235, 0.2)',
        'rgba(255, 206, 86, 0.2)',
      ],
      borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)'],
      borderWidth: 1,
    },
  ],
}

<DonutChart data={data} />
```

### How can I customize the `kbar` search?

Add a `SearchProvider` component such as the one shown below and use it in place of the default `SearchProvider` component in `app/layout.tsx`.

`defaultActions` are the initial list of actions.

`onSearchDocumentsLoad` is a callback function that is called when the documents specified by `searchDocumentsPath` are loaded. Set `searchDocumentsPath` to `false` to disable the dynamically loaded search feature.

```tsx
'use client'

import { KBarSearchProvider } from 'pliny/search/KBar'
import { useRouter } from 'next/navigation'
import { CoreContent } from 'pliny/utils/contentlayer'
import { Blog } from 'contentlayer/generated'

export const SearchProvider = ({ children }) => {
  const router = useRouter()
  return (
    <KBarSearchProvider
      kbarConfig={{
        searchDocumentsPath: 'search.json',
        defaultActions: [
          {
            id: 'homepage',
            name: 'Homepage',
            keywords: '',
            shortcut: ['h', 'h'],
            section: 'Home',
            perform: () => router.push('/'),
          },
          {
            id: 'projects',
            name: 'Projects',
            keywords: '',
            shortcut: ['p'],
            section: 'Home',
            perform: () => router.push('/projects'),
          },
        ],
        onSearchDocumentsLoad(json) {
          return json.map((post: CoreContent<Blog>) => ({
            id: post.path,
            name: post.title,
            keywords: post?.summary || '',
            section: 'Blog',
            subtitle: post.tags.join(', '),
            perform: () => router.push(post.path),
          }))
        },
      }}
    >
      {children}
    </KBarSearchProvider>
  )
}
```

## Licence

Built from the [tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog) template.

[MIT](https://github.com/timlrx/tailwind-nextjs-starter-blog/blob/main/LICENSE) © [Timothy Lin](https://www.timlrx.com)
