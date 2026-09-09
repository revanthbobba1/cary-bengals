# Previews & Recaps Overhaul — Plan

Living document for moving weekly previews/recaps off flat MDX files and onto a Supabase-backed
authoring + rendering pipeline, and for redesigning the surfaces that display them. See
`POLL_SYSTEM_PLAN.md` for the poll system this borrows its architecture from,
`ESPN_INTEGRATION_PLAN.md` for the data source that eventually feeds this, and
`STYLING_OVERHAUL_PLAN.md` for the visual language the redesign must land inside.

Last reviewed: 2026-09-09

## 1. Goal

Two goals, deliberately paired because doing either alone leaves most of the value on the table:

1. **Authoring** — replace hand-written `.mdx` files + git commit + Netlify rebuild with an admin
   UI that writes to Supabase, so publishing a preview is a form submission, not a deploy.
2. **Presentation** — stop rendering a week's article as an undifferentiated wall of markdown.
   The content is already rigidly structured (see §2.2); modeling it as structured data unlocks a
   scoreboard-first article page, season/week navigation, and cross-links to the poll — none of
   which are possible while the content is an opaque MDX blob.

Non-goal for this plan: the ESPN sync itself. This plan only commits to a schema that ESPN data
can populate later without rework.

## 2. Current State Audit

### 2.1 The pipeline as it exists

| Layer                | What's there                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Storage              | 19 `.mdx` files in `data/newsfeed/{2023,2024,2025}/`, frontmatter `title`/`date`/`draft`/`summary`/`authors`           |
| Build                | Contentlayer `Blog` document type (`contentlayer.config.ts`) → `allBlogs`, full remark/rehype chain                    |
| List page            | `app/newsfeed/page.tsx` + `app/newsfeed/page/[page]/page.tsx` → `layouts/ListLayout.tsx`                               |
| Article page         | `app/newsfeed/[...slug]/page.tsx` → `layouts/PostLayout.tsx` (two-column, author sidebar)                              |
| Downstream consumers | `app/page.tsx` (home feed), `app/sitemap.ts`, `scripts/rss.mjs`, `public/search.json` (kbar) — **all read `allBlogs`** |

Publishing today: write MDX → commit → PR → merge → Netlify build. Only someone with repo access
and comfort in git can post. That is the core problem this plan solves.

### 2.2 The content is already structured data

This is the most important finding, and it changes the recommended design. Across all 19 files:

- **Zero JSX/components. Zero images in the body. Zero lists, tables, code, or footnotes.**
  Every file is headings + prose paragraphs. Nothing is using MDX _as_ MDX.
- Every article is **5–6 matchup sections** (6 games = 12 teams), always the same shape:

  |        | Previews                                                                   | Recaps                                                    |
  | ------ | -------------------------------------------------------------------------- | --------------------------------------------------------- |
  | `##`   | Slot / broadcast label — `TNF (Prime)`, `1:00 (CBS)`, `Shitter bowl (FOX)` | The matchup — `Code Monkey (2-3) vs Team Drako (1-4)`     |
  | `###`  | The matchup — `Ladd's Lads at Chasing an Identity`                         | `Final Score: Code Monkey (86.84) vs Team Drako (118.86)` |
  | `####` | The line — `Line: CM -13.1`, `CM -0.69` (present in 8/13 previews)         | —                                                         |
  | body   | 1–4 prose paragraphs                                                       | 1–3 prose paragraphs                                      |

- The **shape** is perfectly consistent; the **formatting** is not. Records are sometimes inline
  in the matchup heading (`(2-5)`), sometimes bare (`6-2`), sometimes absent. The line is
  `#### Line: CM -13.1` in 2024 and `#### CM -0.69` in 2025. `at` vs `vs` is used interchangeably
  even though `at` carries home/away meaning. Recaps put the score in an `###` heading rather than
  anywhere machine-readable.

  Every one of those inconsistencies is a symptom of hand-typed markdown with no schema, and every
  one disappears the moment the fields are fields.

### 2.3 Problems worth fixing while we're in here

Found while auditing; none are caused by the migration but all are cheap to fix as part of it.

- **Pagination is genuinely broken across two routes.** `app/newsfeed/page.tsx` uses
  `POSTS_PER_PAGE = 40`; `app/newsfeed/page/[page]/page.tsx` uses `5`. So `/newsfeed` shows all 19
  posts and claims "1 of 1", while `/newsfeed/page/1` shows 5 and claims "1 of 4" — and the header
  links to the _second_ one (`data/headerNavLinks.ts` → `/newsfeed/page/1`), leaving `/newsfeed`
  effectively orphaned with the wrong constant.
- **Two `<h1>`s on the list page.** `app/newsfeed/page.tsx` renders `<h1>Cary Bengals Newsfeed</h1>`
  and then `ListLayout` renders its own `<h1>{title}</h1>` ("Previews & Recaps") directly beneath.
- **Stale template metadata** — `genPageMetadata({ title: 'Blog' })` on the newsfeed page;
  "Back to the blog" and `aria-label="Back to the blog"` in `PostLayout.tsx`.
- **No season filtering at all.** 2023, 2024 and 2025 are one flat reverse-chronological list.
- **No preview/recap distinction in the UI** — the type exists only inside the title string, so it
  can't be filtered, paired, or badged.
- **Titles are inconsistent** — `2025 Week 1 Preview` vs `Week 1 Recap` vs `Week 1 Preview`.
- **Search only matches `title + summary`**, never body text — so searching a team name finds
  nothing.
- **The author sidebar is usually empty.** Only 7 of 19 posts set `authors`; the other 12 render a
  blank quarter-width column on desktop. It's the widest element on the article page and it's
  mostly whitespace.
- **`teams` only contains the 2026 season** (`005_insert_2026_teams.sql`). Historical articles
  reference teams that have no row in Supabase. This directly constrains the schema — see §3.2.

## 3. Proposed Architecture

### 3.1 Data model: structured matchups with a freeform escape hatch

Three options were considered:

| Option                      | What it is                                                                                                                                    | Verdict                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Markdown blob            | One `articles` row with a `body_markdown` column; render at runtime                                                                           | Solves authoring, solves nothing about presentation. Keeps every §2.2 inconsistency.                                                                                                                          |
| B. Fully structured         | `articles` + `article_matchups`; no freeform prose anywhere                                                                                   | Unlocks everything, but the writer loses the ability to add a season-opener intro, an awards section, or anything that isn't a matchup. Too rigid for a league whose section headings include "Shitter bowl". |
| **C. Hybrid (recommended)** | `articles` (with optional `intro_markdown`/`outro_markdown`) + ordered `article_matchups` rows, each with typed fields **and** a prose `body` | Matchups — 95%+ of the content and all of the structure worth having — become queryable; freeform stays possible.                                                                                             |

**Recommendation: C.** The matchup list is the spine; intro/outro is the escape hatch.

```sql
-- supabase/migrations/0XX_create_article_tables.sql

CREATE TYPE article_kind   AS ENUM ('preview', 'recap');
CREATE TYPE article_status AS ENUM ('draft', 'published');

CREATE TABLE articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year     INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  kind            article_kind NOT NULL,
  slug            TEXT NOT NULL,              -- e.g. '2025/week-one-preview'
  title           TEXT NOT NULL,
  summary         TEXT,
  intro_markdown  TEXT,
  outro_markdown  TEXT,
  status          article_status NOT NULL DEFAULT 'draft',
  published_at    TIMESTAMPTZ,
  author_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_slug     TEXT,                       -- maps to data/authors/*.mdx for the byline
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug),
  UNIQUE (season_year, week_number, kind)     -- one preview + one recap per week, enforced
);

CREATE TABLE article_matchups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,           -- display order within the article
  slot_label      TEXT,                       -- 'TNF (Prime)', 'SNF (NBC)', 'Shitter bowl (FOX)'
  away_team_name  TEXT NOT NULL,              -- display source of truth (see §3.2)
  home_team_name  TEXT NOT NULL,
  away_team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,   -- optional enrichment link
  home_team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
  away_record     TEXT,                       -- '2-5'
  home_record     TEXT,
  line            TEXT,                       -- 'CM -13.1'  (text: it's editorial, not arithmetic)
  away_score      NUMERIC(6,2),               -- recaps only
  home_score      NUMERIC(6,2),
  body            TEXT NOT NULL,              -- the blurb, markdown-lite
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, position)
);

CREATE INDEX idx_articles_season_week ON articles (season_year DESC, week_number DESC);
CREATE INDEX idx_articles_status      ON articles (status, published_at DESC);
CREATE INDEX idx_matchups_article     ON article_matchups (article_id, position);
```

Design notes, each with a reason:

- **`slug` is stored, not derived.** Seeded from today's file paths so every existing URL
  (`/newsfeed/2025/week-one-preview`) keeps working — which also preserves Giscus comment threads,
  since `components/Comments.tsx` keys them on slug.
- **`line` is `TEXT`, not numeric.** It's written as `CM -13.1` — a favorite plus a number, and
  occasionally editorial. Parsing it into two columns buys nothing and loses the 2025 files where
  it's written differently.
- **Scores are `NUMERIC`, not text.** Unlike the line, these _are_ used arithmetically — winner
  highlighting, margin, high-score-of-the-week (§4.2).
- **`UNIQUE (season_year, week_number, kind)`** is what makes preview↔recap pairing (§4.1) a
  guaranteed lookup rather than a heuristic.

### 3.2 Team names are text, with a nullable FK

`teams` holds 2026 rows only, and league team names change _within_ a season (that's half the fun).
So:

- `away_team_name`/`home_team_name` (TEXT, required) is the **display source of truth** — it's what
  the team was called that week, frozen.
- `away_team_id`/`home_team_id` (nullable FK) is an **optional link** used for enrichment: poll-rank
  badges, head-to-head history, ESPN autofill.

This means the historical 2023–2025 backfill does not block on inventing `teams` rows for three
retired rosters, and a mid-season rename never rewrites history. New articles written through the
editor get the FK for free because the team picker is backed by `teams`.

### 3.3 RLS and roles

Mirrors the poll tables, with one hard-won lesson applied. `POLL_SYSTEM_PLAN.md` §3 documents a P0
where migration `010` replaced a SELECT policy and silently dropped members' read access —
undetected for weeks because all testing was done as the commissioner, who bypasses it via a
`FOR ALL` policy.

**Therefore:** every policy for both tables ships in **one** migration, and acceptance explicitly
requires testing as (a) anonymous, (b) a plain `admin` member, (c) the commissioner.

| Role                    | articles / article_matchups                                    |
| ----------------------- | -------------------------------------------------------------- |
| `anon`, `authenticated` | SELECT where `status = 'published'`                            |
| `admin`                 | SELECT/UPDATE/DELETE where `author_id = auth.uid()`. No INSERT |
| `commissioner`          | FOR ALL                                                        |

**No new role, and writeups are assignment-gated.** Every account already carries `admin` (see the
root `CLAUDE.md`), so authoring rides on that rather than adding a `writer` role — rejected as
ceremony for a twelve-person league where everyone is trusted.

Instead, the commissioner assigns each week's writeup. **An assignment is not a new concept: it is
an empty draft with a name on it.** The commissioner creates the `articles` row (season, week,
kind, `status = 'draft'`, `author_id` set to the assignee); that member then sees the editor and
fills it in. Only the commissioner can create rows, which is the single meaningful RLS difference —
`admin`'s "own rows" clause was always going to be `author_id = auth.uid()` anyway.

Consequences, all of them wanted:

- **The editor only appears for the person who owes one.** `/admin` is the poll surface every
  member visits weekly; the article card renders only when a draft is assigned to the viewer,
  exactly like the poll card renders only when a week is open. Members not on duty see nothing new.
- **`author_id` doubles as the byline**, which is correct here: the assignee is the writer. A
  separate `assigned_to` column would only earn its keep if writeups were routinely reassigned
  mid-week or ghost-written, neither of which happens.
- **`UNIQUE (season_year, week_number, kind)` makes assignment exclusive** — once Week 5's recap is
  assigned, a second one cannot be created.
- **It models who is on recap duty**, which the league currently tracks only in the group chat.
  Paired with the hub's "No recap posted" placeholder (§4.1), 2025's ten-previews-zero-recaps gap
  stops being invisible and becomes an outstanding item with a name attached.

**The failure mode to know about:** if the commissioner never assigns a week, nobody sees an editor
and nobody can write it. The commissioner's `FOR ALL` policy is the escape hatch — they can create
or reassign any article at any time, including to themselves — so nothing is ever permanently
blocked, but the flow does depend on the assignment happening. Accepted deliberately.

Publishing runs through a `SECURITY DEFINER` RPC (`publish_article`) rather than a bare UPDATE, for
the same reason `submit_poll_ballot` exists (`020`): setting `status`, stamping `published_at`, and
validating that the article has at least one matchup must be one transaction.

### 3.4 Rendering DB-stored markdown

Contentlayer compiles MDX at build time and cannot render a row fetched at request time. Since
§2.2 established there is no JSX anywhere in this content and there never should be (it'd be
arbitrary code from a form field), the answer is a **markdown renderer, not an MDX runtime**:

- **`react-markdown` + the existing `remark-gfm`.** Pin `react-markdown@8`, which pairs with
  `remark-gfm@^3` already in `package.json` — v9 requires remark-gfm v4 and would conflict with
  Contentlayer's chain. It does not render raw HTML by default, so there's no `rehype-raw` and no
  sanitization gap.
- Rejected: `next-mdx-remote` — runtime MDX compilation plus JSX execution on admin-entered text,
  for content that uses neither.
- Style with the existing `prose dark:prose-invert` classes so DB-rendered prose is visually
  identical to today's.

### 3.5 Caching

Public article pages need no auth, so they should **not** use the cookie-based `lib/supabase/server.ts`
client (reading cookies forces every route dynamic). Add `lib/supabase/public.ts` — a cookie-free
anon client — which lets the public routes use `export const revalidate = 300` (ISR) and stay
static between publishes. The admin publish action then calls `revalidatePath('/newsfeed')` and
`revalidatePath('/newsfeed/[...slug]', 'page')` so a publish is live immediately rather than in
five minutes.

Contentlayer stays in the project for the `Authors` document type (`/league-members` and the
article byline still need it); only the `Blog` type is removed.

### 3.6 Downstream consumers that break

All four read `allBlogs` and must be re-pointed in the same phase the MDX files are deleted:

| Consumer                                       | Today                     | After                                                                                             |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Home feed (`app/page.tsx`)                     | `allBlogs`                | Supabase query, latest 5 published                                                                |
| Sitemap (`app/sitemap.ts`)                     | `allBlogs`                | Supabase query (it's already a TS module; just async)                                             |
| RSS (`scripts/rss.mjs`, build-time)            | `.contentlayer/generated` | `app/feed.xml/route.ts` — a Route Handler, always fresh instead of stale-until-next-build         |
| kbar search (`public/search.json`, build-time) | Contentlayer `onSuccess`  | `app/api/search-index/route.ts`; point `siteMetadata.search.kbarConfig.searchDocumentsPath` at it |

Moving RSS and search off build-time output is a **fix, not just a port** — today both go stale the
moment anything is published without a rebuild, which is exactly the state this whole plan creates.
The search index should also start including matchup team names and body text, closing §2.3's
"searching a team name finds nothing".

## 4. Redesign

The current article page is the starter-blog default: centered title, empty author column, wall of
markdown. With §3.1's structure in place, this is what's now possible. Everything below lands
inside the existing token system from `STYLING_OVERHAUL_PLAN.md` (`shadow-card`/`raised`,
`rounded-card`/`control`, `ease-out-expo`, `ink`, `primary`/`accent`) — no new visual language.

### 4.1 Hub page (`/newsfeed` → "Previews & Recaps")

Replace the flat chronological list with a **season archive**:

```
Previews & Recaps
[ 2025 ][ 2024 ][ 2023 ]          ← season pills (newest first, mirrors CommissionerPollClient)
[ All ][ Previews ][ Recaps ]     ← type filter
[ search... ]

WEEK 10  ┌── PREVIEW ─────────────┐  ┌── RECAP ───────────────┐
         │ 2025 Week 10 Preview   │  │  No recap posted yet   │
         │ summary…  · 6 games    │  │  (muted placeholder)   │
         │ Nov 6 · Rishi          │  │                        │
         └────────────────────────┘  └────────────────────────┘
WEEK 9   ┌── PREVIEW ─────────────┐  ┌── RECAP ───────────────┐
```

- **Week-paired rows** instead of one flat stream. This is the change that makes the page read as
  a season archive. It also surfaces the gap — 2025 has ten previews and _zero_ recaps, which today
  is invisible; as a muted placeholder it becomes a visible to-do for the commissioner.
- **Season pills** replace the "scroll forever to reach 2023" problem. Derived from
  `SELECT DISTINCT season_year`, defaulting to newest — same pattern as the poll's year dropdown, so
  the two sections of the site behave alike. On mobile, a `<select>`.
- Cards get the standard hover treatment (`hover:-translate-y-0.5 hover:shadow-raised`).
- Fixes §2.3's duplicate `<h1>`, the 40-vs-5 pagination split (this layout paginates by _season_,
  so `POSTS_PER_PAGE` disappears entirely along with `/newsfeed/page/[page]`), and the `'Blog'`
  metadata title. `headerNavLinks.ts` points back at `/newsfeed`.

_Alternative considered:_ a vertical season timeline rail. More distinctive, but weaker at the
preview↔recap pairing that the data model now guarantees. The paired grid wins.

### 4.2 Article page

```
┌────────────────────────────────────────────────────────────────┐
│ 2025 · WEEK 1 · [PREVIEW]                                      │
│ Week 1 Preview                                                 │
│ Sept 4, 2025 · Rishi · 6 games · 4 min read                    │
├────────────────────────────────────────────────────────────────┤
│ SCOREBOARD  (horizontally scrollable, anchors to sections)     │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐   │
│ │TNF     ││Brazil  ││1:00    ││4:25    ││SNF     ││MNF     │   │
│ │T21  @  ││BILL    ││SAWGF   ││KvTW  @ ││HR    @ ││…       │   │
│ │CM -0.69││IHAL    ││+2.49   ││JJJM    ││TET     ││        │   │
│ └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘   │
├──────────────────────────────────────────┬─────────────────────┤
│ [intro prose, if any]                    │  ON THIS PAGE       │
│                                          │  · TNF Opening Night│
│ ┌── SNF (NBC) ──────────────────────┐    │  · Friday in Brazil │
│ │ Heterophobes Reloaded    (3-4)    │    │  · 1:00             │
│ │  at Tet Offensive        (3-4)    │    │  …  (sticky)        │
│ │                        HR -3.62   │    │                     │
│ ├───────────────────────────────────┤    │  ─────────────      │
│ │ Lovers off the field but enemies  │    │  Week 1 in the poll │
│ │ on it, HPRL travels to…           │    │  1. Kamara vs …     │
│ └───────────────────────────────────┘    │  2. …               │
├──────────────────────────────────────────┴─────────────────────┤
│ ← Week 1 Preview        See how it turned out → Week 1 Recap   │
│ [Giscus]                                                       │
└────────────────────────────────────────────────────────────────┘
```

The five substantive changes:

1. **Scoreboard strip.** The single biggest upgrade. Today, seeing what games are in a week means
   scrolling ~70 lines of prose. A strip of six mini game cards shows the whole week at a glance
   and jump-links into each blurb. Impossible before §3.1; nearly free after.
2. **Matchup cards with a real two-team header.** Team names, records, and line/score become
   _rendered fields_ — aligned, consistently formatted, winner highlighted on recaps — instead of
   three heading levels of hand-typed text. This alone erases every formatting inconsistency in
   §2.2 for all future articles.
3. **The empty author column becomes a sticky matchup TOC**, with the byline moving up to the
   header where it belongs. Fixes §2.3's mostly-blank quarter-width column.
4. **Preview ↔ recap cross-link**, guaranteed by the unique constraint. Prev/next also becomes
   _within-season_ rather than crossing year boundaries mid-navigation.
5. **Poll cross-link.** `poll_results` is already keyed by (season, week) — the same key as an
   article. Showing that week's top-5 (or a rank badge per team in the scoreboard) connects the two
   halves of the site for the first time, with zero new content work.

**Recap-specific:** winner highlighting and margin come free from `NUMERIC` scores; a "high score of
the week" callout is one `ORDER BY` away.

### 4.3 Admin editor (`/admin/articles`)

- **Assignment (commissioner only)** — pick season / week / kind + member, which creates the draft
  shell (§3.3). Structurally the same form as `PollWeekManager`'s create-week form, and it belongs
  in the same commissioner-only section pattern `/admin` already established. The commissioner's
  view of `/admin/articles` doubles as the duty roster: who owes what, and which weeks are
  unassigned.
- **The member's view** — `/admin` shows an article card only when a draft is assigned to the
  viewer, mirroring the existing poll-status card ("you have not submitted your rankings yet").
  One query: is there a draft where `author_id = auth.uid()`.
- `/admin/articles` — list, filtered by season, drafts pinned to the top with a status badge.
  Added to `AdminSubNav` (which currently hardcodes three poll sections and needs a small
  generalization).
- `/admin/articles/[id]/edit` — one form (no `/new`: rows are created by assignment, not by the
  writer):
  - Season / week / kind are fixed by the assignment; the title is auto-suggested
    (`2025 Week 1 Preview`) and overridable.
  - Summary + optional intro/outro.
  - A **repeatable matchup list**, reorderable by drag — `framer-motion` is already used for exactly
    this in `PollSubmissionForm.tsx`, so it's an established pattern, not a new dependency.
  - Team fields are comboboxes backed by `teams` for that season, falling back to free text (§3.2).
  - Save draft / Publish / Unpublish, with `useToast()` confirmations (already in place).
  - **Preview-as-rendered** — the draft rendered through the real article template before publish.

**The ergonomics risk, and the mitigations.** A six-matchup structured form is more clicks than
typing markdown, and the writer is a volunteer. Three answers, in order of value:

1. **Paste-markdown import.** A textarea that runs the _same parser_ as the §5 backfill script and
   fills the form. The writer can still draft in whatever editor they like and paste. This also
   means the backfill parser isn't throwaway code — it becomes a permanent feature.
2. **"Copy last week's matchups"** — teams and slot labels rarely change shape week to week; the
   writer edits records/lines and writes blurbs.
3. **ESPN autofill** (`ESPN_INTEGRATION_PLAN.md`) — eventually teams, records, lines, and final
   scores prefill themselves and the writer only writes prose. This is the strongest argument for
   the structured model: it's the only one that can _receive_ that data.

## 5. Backfilling the 19 existing articles

A one-time Node script (`scripts/import-articles.mjs`), run locally, not in CI:

1. Read each `data/newsfeed/**/*.mdx`; `gray-matter` (already a dependency) for frontmatter.
2. Split the body on the heading pattern for its kind (§2.2's table). Handle both the
   preview shape (`##` slot / `###` matchup / optional `####` line) and the recap shape
   (`##` matchup-with-records / `###` final score).
3. Extract `(2-5)` / `6-2` records and `(115.06)` scores with a tolerant regex; leave `NULL` on
   no match rather than guessing.
4. Emit **two** outputs: an idempotent SQL seed migration, and a `review.md` diff listing every
   field it could not confidently parse.
5. Hand-fix the review list. With 19 articles × 6 matchups this is ~30 minutes of work, and it's
   the only time it's ever needed.

`slug` seeds from the existing file path so URLs and Giscus threads survive. `status` = `published`
for everything with `draft: false`.

**Parity check before deleting anything:** render both pipelines side by side and diff the visible
text per article. The MDX files are only deleted (and the Contentlayer `Blog` type removed) after
parity passes.

## 6. Phasing

Each phase is independently shippable and independently reviewable, per the repo's one-PR-per-phase
convention. Ordering is deliberate: the read path is proven against real backfilled data _before_
any editor UI is built on top of the model.

| Phase             | Scope                                                                                                                                                                                                                                | Ships                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **0 — Schema**    | Migration (tables, enums, indexes, **all** RLS policies, `publish_article` RPC), `lib/types/article.ts`, `writer` role, `lib/supabase/public.ts`                                                                                     | Nothing user-visible                                                                           |
| **1 — Backfill**  | `scripts/import-articles.mjs`, seed migration, hand-fix pass, parity report                                                                                                                                                          | Nothing user-visible; DB now holds all 19 articles                                             |
| **2 — Read path** ✅ | DB-backed `/previews-recaps` + `/previews-recaps/[...slug]` (renamed from `/newsfeed`, see §7.2), `react-markdown`, home feed / sitemap / RSS route / search-index route re-pointed. **Deleted** the MDX files, the Contentlayer `Blog` type, `scripts/rss.mjs`, `scripts/postbuild.mjs`, `/newsfeed/page/[page]` and the now-dead `ListLayout`/`PostLayout`/`PostSimple`/`PostBanner` | Site now served from Supabase; §2.3's pagination, double-`<h1>`, and stale-metadata bugs fixed. Search now also matches matchup team names and body text (closing another §2.3 gap) |
| **3 — Editor** ✅  | Commissioner assignment form; `/admin` assigned-draft card; `/admin/articles` list + editor, drag-reorder matchups, draft/publish, `AdminSubNav` generalization, `revalidatePath` on publish. Paste-import **descoped** (see §7.1); team-name picker, record autofill, and "copy last week's slots" shipped instead as Phase 4a | **The actual goal: publishing without a deploy**                                               |
| **4 — Redesign** ✅ | Editor QoL (4a); hub season pills + flexible per-week grid + `/articles` rename (4b-i); article scoreboard strip, matchup cards, sticky TOC, poll cross-link (4b-ii); preview-as-rendered in the editor, preview↔recap cross-link, within-season-only prev/next (4c) | The presentation payoff                                                                        |

Phases 2 and 4 could merge, but keeping them apart means the risky part (cutting over the data
source) lands with the _old_ design intact, so any regression is unambiguously a data problem and
not a layout problem.

**Rough sizing:** 0 and 1 are half a day each. 2 is the largest and riskiest. 3 is the biggest
UI surface. 4 is the most fun and the most optional — everything before it is already a strict
improvement.

## 7. Decisions

### 7.1 Settled

- **Structured matchups, not a markdown blob (§3.1) — decided 2026-09-05.** The hybrid model:
  ordered `article_matchups` rows as the spine, optional `intro_markdown`/`outro_markdown` as the
  escape hatch. A blob would have been roughly a third of the work and delivered goal 1
  (authoring) while delivering almost none of goal 2 (presentation) — and would have preserved
  every formatting inconsistency catalogued in §2.2 rather than eliminating the class.

- **No new role; authoring rides on `admin` (§3.3) — decided 2026-09-05.** All twelve members
  already have `admin` for poll submissions.
- **Writeups are assignment-gated (§3.3) — decided 2026-09-05.** The commissioner creates each
  week's draft with an `author_id`; only that member sees the editor. Chosen over leaving the
  editor open to all admins because it costs almost nothing (an assignment is just an empty draft)
  and models who is on recap duty. Accepted failure mode: an unassigned week has no writer until
  the commissioner assigns it.

- **URLs renamed and slugs normalized (§4 above) — decided 2026-09-07, reversing this plan's
  original recommendation.** `/newsfeed` → `/previews-recaps`; slugs went from spelled-out week
  numbers (`week-one-preview`) to digits (`week-1-preview`). The original "keep existing URLs"
  recommendation assumed something was live to preserve; verified before reversing it that there
  are **zero GitHub Discussions** on this repo and **no Giscus env vars configured anywhere** (not
  even `.env.local`), so no comment thread has ever existed to orphan, and there's no evidence of
  external backlinks to this private 12-person league site. `article_slug()` (028) was updated in
  `030_normalize_article_slugs.sql` to match, and `/newsfeed` now 404s with no redirect — not worth
  building one given nothing live depends on the old paths.
- **`/newsfeed` renamed to `/previews-recaps` everywhere — decided 2026-09-07.** Route, nav, and
  metadata all now agree, closing the three-way inconsistency this section originally flagged.
- **`/previews-recaps` renamed to `/articles` everywhere — decided 2026-09-08, during Phase 4b.**
  A second rename of the same surface, for a different reason than the first: most weeks have only
  a preview and no recap (all of the 2025 season, live-verified, at the time of this decision), so
  the compound name overclaimed what's actually there, and a single short word reads better in the
  nav than "Previews & Recaps". This also fixed an inconsistency that had quietly grown since
  Phase 3: `/admin/articles` and `components/articles/` already said "Articles" throughout; only
  the public route/nav/headings still said "Previews & Recaps". Same reasoning as the first rename
  applies to why this is safe — no live comment threads or backlinks to a private league site — so
  no redirect from `/previews-recaps` either.

- **Paste-markdown import (§4.3's mitigation #1) descoped — decided 2026-09-08.** Admins will
  either type directly into the form or paste plain prose from notes/Slack, not a formatted
  document meant for a parser — a formatting-based importer has no real audience here. Mitigations
  #2 ("copy last week's matchups," reworked to slot-labels-only after a domain-reality check — see
  below) and the team-name picker + record autofill shipped instead, covering the actual
  ergonomics complaint (manual typing) without building an importer nobody would use.
- **"Copy last week's matchups" reworked to "copy last week's slots" — decided 2026-09-08.** The
  plan's original mitigation #2 assumed team pairings repeat week to week; they don't in this
  league's schedule, so copying matchups verbatim would insert wrong data. What repeats is the
  broadcast slot structure (TNF, SNF, MNF, etc.) — that's what's copied; team names are picked
  fresh via the new picker.
- **Phase 4c shipped the three items 4b-ii deferred — landed 2026-09-09.** "Preview-as-rendered"
  in the editor (`/admin/articles/[id]/preview`, opened from a new Preview link on the edit page,
  rendering the last-saved draft through `ArticleView` — the same component the live article page
  uses, extracted for exactly this reuse); a preview↔recap cross-link (`getSiblingArticle()`, at
  most one match per the `UNIQUE (season_year, week_number, kind)` constraint, omitted gracefully
  when the other half doesn't exist); and within-season-only prev/next. Closes §4.2 item 4 and the
  last of §4.3's editor scope.

### 7.2 Still open

None currently.
