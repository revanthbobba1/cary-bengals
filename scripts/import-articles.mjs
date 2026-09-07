// One-time backfill: reads data/newsfeed/**/*.mdx and produces two outputs --
//   supabase/migrations/029_backfill_articles.sql  (idempotent seed, ON CONFLICT DO NOTHING)
//   review.md                                      (every field the parser couldn't confidently read)
// See docs/PREVIEWS_RECAPS_PLAN.md §5. Run once, hand-fix per review.md, then delete this script
// and the MDX files once the parity check passes -- it has no reason to run a second time.
//
// Usage:
//   node scripts/import-articles.mjs                 # full run, writes both output files
//   node scripts/import-articles.mjs --dry-run        # full run, prints instead of writing
//   node scripts/import-articles.mjs --file 2023/week-one-preview.mdx   # one file, prints parsed JSON

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import matter from 'gray-matter'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const NEWSFEED_DIR = path.join(ROOT, 'data/newsfeed')
const AUTHORS_DIR = path.join(ROOT, 'data/authors')
const SQL_OUTPUT = path.join(ROOT, 'supabase/migrations/029_backfill_articles.sql')
const REVIEW_OUTPUT = path.join(ROOT, 'review.md')

// Matches article_slug() in supabase/migrations/028_create_article_tables.sql -- slugs for these
// 19 files come from the existing file path, not this list, but week NUMBERS are recovered from
// the word in the path, so the two must agree.
const WEEK_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
]

// Verified against every "### "/"## " matchup heading in the corpus (see the review conversation
// that produced this script): the leftmost "vs"/"at" is the real separator in every case except
// this one, where a team's own name ("Kamara vs the World") sits on the away side and contains an
// earlier, spurious "vs". Confirmed with the league commissioner before hardcoding.
const USE_LAST_SEPARATOR = new Set(['2025/week-one-preview.mdx#4'])

const ALLOWED_FRONTMATTER_KEYS = new Set(['title', 'date', 'draft', 'summary', 'authors'])

// The 3 files early in the 2024 season shipped with a blank `summary:` in frontmatter. Confirmed
// with the commissioner that a short, generic summary is fine here rather than transcribing the
// actual matchups.
const SUMMARY_OVERRIDES = new Map([
  [
    '2024/week-one-preview.mdx',
    'Week 1 of the 2024 Cary Bengals season kicks off with six fresh matchups as every team looks to start the year on the right foot.',
  ],
  [
    '2024/week-one-recap.mdx',
    'A look back at Week 1 of the 2024 season, as six matchups wrapped up the opening week of Cary Bengals fantasy football.',
  ],
  [
    '2024/week-two-preview.mdx',
    'Week 2 previews for the 2024 Cary Bengals season, as teams look to build on or bounce back from their Week 1 results.',
  ],
])

function loadAuthorRoster() {
  const files = fs.readdirSync(AUTHORS_DIR).filter((f) => f.endsWith('.mdx'))
  const slugs = new Set()
  const ownerNames = new Set()
  for (const file of files) {
    const raw = fs.readFileSync(path.join(AUTHORS_DIR, file), 'utf8')
    const { data } = matter(raw)
    slugs.add(file.replace(/\.mdx$/, ''))
    if (data.name) ownerNames.add(String(data.name).trim())
  }
  return { slugs, ownerNames }
}

const { slugs: AUTHOR_SLUGS, ownerNames: KNOWN_OWNERS } = loadAuthorRoster()

// ---------------------------------------------------------------------------
// File discovery + identity
// ---------------------------------------------------------------------------

function readArticleFiles() {
  const seasons = fs
    .readdirSync(NEWSFEED_DIR)
    .filter((d) => fs.statSync(path.join(NEWSFEED_DIR, d)).isDirectory())
  const files = []
  for (const season of seasons) {
    for (const f of fs.readdirSync(path.join(NEWSFEED_DIR, season))) {
      if (f.endsWith('.mdx')) files.push(`${season}/${f}`)
    }
  }
  return files.sort((a, b) => {
    const ia = deriveIdentity(a)
    const ib = deriveIdentity(b)
    if (ia.season !== ib.season) return ia.season - ib.season
    if (ia.week !== ib.week) return ia.week - ib.week
    return ia.kind.localeCompare(ib.kind) // 'preview' < 'recap'
  })
}

function deriveIdentity(relPath) {
  const m = relPath.match(/^(\d{4})\/week-([a-z]+)-(preview|recap)\.mdx$/)
  if (!m) throw new Error(`Unexpected file path shape: ${relPath}`)
  const [, yearStr, weekWord, kind] = m
  const weekIdx = WEEK_WORDS.indexOf(weekWord)
  if (weekIdx === -1) throw new Error(`Unknown week word "${weekWord}" in ${relPath}`)
  const season = Number(yearStr)
  const week = weekIdx + 1
  return { season, week, kind, slug: `${season}/week-${weekWord}-${kind}` }
}

// ---------------------------------------------------------------------------
// Heading tokenizer
// ---------------------------------------------------------------------------

// `\s*` (not `\s+`) after the hashes on purpose -- data/newsfeed/2023/week-five-preview.mdx has a
// literal "##1:00 (CBS)" with no space, which must still be recognized as a level-2 heading.
function tokenizeBody(body) {
  const lines = body.split(/\r?\n/)
  const tokens = []
  let buffer = []
  const flush = () => {
    const text = buffer.join('\n').trim()
    if (text) tokens.push({ type: 'text', text })
    buffer = []
  }
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s*(.*)$/)
    if (m) {
      flush()
      tokens.push({ type: 'heading', level: m[1].length, text: m[2].trim() })
    } else {
      buffer.push(line)
    }
  }
  flush()
  return tokens
}

// ---------------------------------------------------------------------------
// Matchup heading splitting: team names, records, owner names
// ---------------------------------------------------------------------------

function peelSide(side) {
  let name = side
  let record = null
  let owner = null

  if (/\)\s*$/.test(side)) {
    const m = side.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    if (m) {
      const inner = m[2].trim()
      if (/^\d{1,2}-\d{1,2}$/.test(inner)) {
        record = inner
        name = m[1]
      } else if (KNOWN_OWNERS.has(inner)) {
        owner = inner
        name = m[1]
      }
      // else: an unrecognized parenthetical (a nickname like "(PR #414)" or "(MASTER)") --
      // leave `name` as the untouched full side, keeping it as part of the team name.
    }
  } else {
    // No trailing paren at all -- a bare record like "Code Monkey (PR #414) 6-2". Only runs when
    // there's no trailing paren, so it never fights with the branch above, and it never misfires on
    // a team name that just happens to look like a record (e.g. "Chasing 0-1"), because that name
    // always co-occurs with a trailing owner-paren in this corpus, which the branch above consumes
    // first.
    const bm = side.match(/\s(\d{1,2}-\d{1,2})\s*$/)
    if (bm) {
      record = bm[1]
      name = side.slice(0, bm.index)
    }
  }

  return { name: name.trim(), record, owner }
}

function splitMatchupHeading(rawText, overrideKey) {
  const text = rawText.replace(/\s+/g, ' ').trim()
  const separatorRe = /\s(vs\.?|at)\s/gi
  let match
  let firstMatch = null
  let lastMatch = null
  while ((match = separatorRe.exec(text))) {
    if (!firstMatch) firstMatch = match
    lastMatch = match
  }

  const chosen = USE_LAST_SEPARATOR.has(overrideKey) ? lastMatch : firstMatch

  let awaySide
  let homeSide
  let matched = true
  if (chosen) {
    awaySide = text.slice(0, chosen.index)
    homeSide = text.slice(chosen.index + chosen[0].length)
  } else {
    awaySide = text
    homeSide = text
    matched = false
  }

  const away = peelSide(awaySide)
  const home = peelSide(homeSide)
  return {
    awayName: away.name,
    homeName: home.name,
    awayRecord: away.record,
    homeRecord: home.record,
    awayOwner: away.owner,
    homeOwner: home.owner,
    matched,
  }
}

// ---------------------------------------------------------------------------
// Score / line field extraction
// ---------------------------------------------------------------------------

// Deliberately separator-agnostic: the "Final Score:" line uses "vs", "vs.", " - ", and once a
// malformed "-)" (2024/week-one-recap.mdx). Pulling every parenthesized number instead of trying
// to parse the separator handles all of them, including team-name parens like "(Master)" that
// aren't numeric and so are never captured.
function extractFinalScore(text) {
  const nums = [...text.matchAll(/\(([\d]+(?:\.[\d]+)?)\)/g)].map((m) => m[1])
  if (nums.length === 2) {
    return { awayScore: nums[0], homeScore: nums[1], warning: null }
  }
  return {
    awayScore: null,
    homeScore: null,
    warning: `Final Score line has ${nums.length} parenthesized number(s), expected 2: "${text}"`,
  }
}

// Not identified by heading level -- data/newsfeed/2023/week-three-preview.mdx has one at "###"
// instead of "####". Identified by position (whatever heading immediately follows the matchup
// title, before any body text) and validated by shape once found.
function normalizeLineField(headingText) {
  const t = headingText.trim()
  if (/^line:/i.test(t)) {
    return { value: t.replace(/^line:\s*/i, '').trim() || null, invalid: false }
  }
  if (/^[^:]{0,24}[+-]\d+(?:\.\d+)?$/.test(t)) {
    return { value: t, invalid: false }
  }
  return { value: t, invalid: true }
}

function extractTrailingOutro(bodyText) {
  const paragraphs = bodyText.split(/\n\n+/)
  const last = paragraphs[paragraphs.length - 1]
  if (last && /^>/.test(last.trim())) {
    return { body: paragraphs.slice(0, -1).join('\n\n').trim(), outro: last.trim() }
  }
  return { body: bodyText, outro: null }
}

// ---------------------------------------------------------------------------
// Preview parsing: ## slot / ###(-ish) matchup title / optional line heading / body
// ---------------------------------------------------------------------------

function parsePreviewMatchups(tokens, relPath, warnings) {
  const matchups = []
  let slotLabel = null
  let current = null
  let phase = 'idle' // idle | awaiting_title | awaiting_line_or_body | body

  const finalize = () => {
    if (!current) return
    matchups.push(finishPreviewMatchup(current, relPath, warnings))
    current = null
  }

  for (const tok of tokens) {
    if (tok.type === 'heading' && tok.level === 2) {
      finalize()
      slotLabel = tok.text
      phase = 'awaiting_title'
      continue
    }
    if (tok.type === 'heading' && phase === 'idle') {
      warnings.push(
        `Heading "${tok.text}" appeared before any "##" slot heading -- treating it as a matchup with no slot_label`
      )
      current = {
        position: matchups.length + 1,
        slotLabel: null,
        titleText: tok.text,
        lineText: null,
        bodyParts: [],
      }
      phase = 'awaiting_line_or_body'
      continue
    }
    if (tok.type === 'heading' && (phase === 'awaiting_title' || phase === 'body')) {
      finalize()
      current = {
        position: matchups.length + 1,
        slotLabel,
        titleText: tok.text,
        lineText: null,
        bodyParts: [],
      }
      phase = 'awaiting_line_or_body'
      continue
    }
    if (tok.type === 'heading' && phase === 'awaiting_line_or_body') {
      current.lineText = tok.text
      phase = 'body'
      continue
    }
    if (tok.type === 'text') {
      if (phase === 'awaiting_line_or_body') phase = 'body'
      if (current) current.bodyParts.push(tok.text)
    }
  }
  finalize()
  return matchups
}

function finishPreviewMatchup(current, relPath, warnings) {
  const key = `${relPath}#${current.position}`
  const split = splitMatchupHeading(current.titleText, key)
  if (!split.matched) {
    warnings.push(
      `Matchup #${current.position}: heading "${current.titleText}" didn't split into two teams -- both team-name fields fall back to the raw heading text`
    )
  }
  if (Boolean(split.awayRecord) !== Boolean(split.homeRecord)) {
    warnings.push(
      `Matchup #${current.position} ("${current.titleText}"): asymmetric record extraction (away=${split.awayRecord ?? 'null'}, home=${split.homeRecord ?? 'null'})`
    )
  }
  if (split.awayOwner) {
    warnings.push(
      `FYI: Matchup #${current.position}: dropped owner name "${split.awayOwner}" from the away team heading (already named in the prose body)`
    )
  }
  if (split.homeOwner) {
    warnings.push(
      `FYI: Matchup #${current.position}: dropped owner name "${split.homeOwner}" from the home team heading (already named in the prose body)`
    )
  }

  let line = null
  if (current.lineText !== null) {
    const normalized = normalizeLineField(current.lineText)
    if (normalized.invalid) {
      warnings.push(
        `Matchup #${current.position}: heading "${current.lineText}" right after the matchup title didn't look line-shaped -- kept as line verbatim, please confirm`
      )
    }
    line = normalized.value
  }

  return {
    id: randomUUID(),
    position: current.position,
    slotLabel: current.slotLabel,
    awayTeamName: split.awayName,
    homeTeamName: split.homeName,
    awayRecord: split.awayRecord,
    homeRecord: split.homeRecord,
    line,
    awayScore: null,
    homeScore: null,
    body: current.bodyParts.join('\n\n').trim(),
  }
}

// ---------------------------------------------------------------------------
// Recap parsing: ## matchup (with or without records) / ### Final Score / body
// ---------------------------------------------------------------------------

function parseRecapMatchups(tokens, relPath, warnings) {
  const matchups = []
  let current = null
  let phase = 'idle' // idle | awaiting_final_score | body

  const finalize = () => {
    if (!current) return
    matchups.push(finishRecapMatchup(current, relPath, warnings))
    current = null
  }

  for (const tok of tokens) {
    if (tok.type === 'heading' && tok.level === 2) {
      finalize()
      current = {
        position: matchups.length + 1,
        titleText: tok.text,
        finalScoreText: null,
        bodyParts: [],
      }
      phase = 'awaiting_final_score'
      continue
    }
    if (tok.type === 'heading' && phase === 'awaiting_final_score') {
      current.finalScoreText = tok.text
      phase = 'body'
      continue
    }
    if (tok.type === 'text') {
      if (phase === 'awaiting_final_score' && current) {
        warnings.push(
          `Matchup #${current.position} ("${current.titleText}"): no "Final Score:" heading found before body text -- scores left NULL`
        )
        phase = 'body'
      }
      if (current) current.bodyParts.push(tok.text)
    }
  }
  finalize()
  return matchups
}

function finishRecapMatchup(current, relPath, warnings) {
  const key = `${relPath}#${current.position}`
  const split = splitMatchupHeading(current.titleText, key)
  if (!split.matched) {
    warnings.push(
      `Matchup #${current.position}: heading "${current.titleText}" didn't split into two teams`
    )
  }
  if (Boolean(split.awayRecord) !== Boolean(split.homeRecord)) {
    warnings.push(
      `Matchup #${current.position} ("${current.titleText}"): asymmetric record extraction`
    )
  }
  if (split.awayOwner) {
    warnings.push(
      `FYI: Matchup #${current.position}: dropped owner name "${split.awayOwner}" from the heading`
    )
  }
  if (split.homeOwner) {
    warnings.push(
      `FYI: Matchup #${current.position}: dropped owner name "${split.homeOwner}" from the heading`
    )
  }

  let awayScore = null
  let homeScore = null
  if (current.finalScoreText) {
    const result = extractFinalScore(current.finalScoreText)
    awayScore = result.awayScore
    homeScore = result.homeScore
    if (result.warning) warnings.push(`Matchup #${current.position}: ${result.warning}`)
  }

  return {
    id: randomUUID(),
    position: current.position,
    slotLabel: null,
    awayTeamName: split.awayName,
    homeTeamName: split.homeName,
    awayRecord: split.awayRecord,
    homeRecord: split.homeRecord,
    line: null,
    awayScore,
    homeScore,
    body: current.bodyParts.join('\n\n').trim(),
  }
}

// ---------------------------------------------------------------------------
// Per-article parsing
// ---------------------------------------------------------------------------

function resolveAuthorSlug(frontmatter, warnings) {
  const authors = frontmatter.authors
  if (authors === undefined) return null
  if (!Array.isArray(authors) || authors.length === 0) {
    warnings.push('"authors" present in frontmatter but empty')
    return null
  }
  if (authors.length > 1) {
    warnings.push(
      `"authors" has ${authors.length} entries, schema only supports one author_slug -- using the first`
    )
  }
  const slug = authors[0]
  if (!AUTHOR_SLUGS.has(slug)) {
    warnings.push(`author slug "${slug}" has no matching file in data/authors/`)
  }
  return slug
}

function parseArticle(relPath) {
  const absPath = path.join(NEWSFEED_DIR, relPath)
  const raw = fs.readFileSync(absPath, 'utf8')
  const { data: frontmatter, content } = matter(raw)
  const identity = deriveIdentity(relPath)
  const warnings = []

  let tokens = tokenizeBody(content)
  if (tokens[0] && tokens[0].type === 'text') {
    warnings.push(
      `Non-empty content before the first heading (would be intro_markdown): "${tokens[0].text.slice(0, 80)}"`
    )
    tokens = tokens.slice(1)
  }

  const matchups =
    identity.kind === 'preview'
      ? parsePreviewMatchups(tokens, relPath, warnings)
      : parseRecapMatchups(tokens, relPath, warnings)

  let outroMarkdown = null
  if (identity.kind === 'preview' && matchups.length > 0) {
    const last = matchups[matchups.length - 1]
    const extracted = extractTrailingOutro(last.body)
    if (extracted.outro) {
      outroMarkdown = extracted.outro
      last.body = extracted.body
      warnings.push(
        `Extracted trailing blockquote as outro_markdown -- please confirm it reads correctly: "${extracted.outro.slice(0, 80)}"`
      )
    }
  }

  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      warnings.push(`Unrecognized frontmatter key "${key}" -- dropped`)
    }
  }

  let summary = (frontmatter.summary || '').toString().trim() || null
  if (!summary && SUMMARY_OVERRIDES.has(relPath)) {
    summary = SUMMARY_OVERRIDES.get(relPath)
    warnings.push(`FYI: summary was blank in frontmatter -- used a generic override: "${summary}"`)
  } else if (!summary) {
    warnings.push('Empty summary -- needs one for the hub card')
  }

  const authorSlug = resolveAuthorSlug(frontmatter, warnings)

  // All 19 files quote their frontmatter date ('2023-09-07'), so gray-matter/js-yaml hands back a
  // plain string. An unquoted date would instead parse as a JS Date, and String(Date) produces a
  // locale/timezone-dependent string, not an ISO date -- so guard against that explicitly rather
  // than trusting every future file to quote it.
  let publishedAt = frontmatter.date
  if (publishedAt instanceof Date) {
    warnings.push(
      `frontmatter "date" parsed as a Date object (likely unquoted in the file) -- normalized to ${publishedAt.toISOString().slice(0, 10)}, please confirm`
    )
    publishedAt = publishedAt.toISOString().slice(0, 10)
  }

  const article = {
    id: randomUUID(),
    seasonYear: identity.season,
    weekNumber: identity.week,
    kind: identity.kind,
    slug: identity.slug,
    title: frontmatter.title,
    summary,
    introMarkdown: null,
    outroMarkdown,
    status: frontmatter.draft ? 'draft' : 'published',
    publishedAt,
    authorSlug,
  }

  return { relPath, article, matchups, warnings }
}

// ---------------------------------------------------------------------------
// SQL / review.md rendering
// ---------------------------------------------------------------------------

const sqlString = (v) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
const sqlNumber = (v) => (v === null || v === undefined ? 'NULL' : String(v))

function renderArticleSql({ relPath, article, matchups }) {
  const lines = []
  lines.push(`-- ${relPath}`)
  lines.push(
    'INSERT INTO articles (id, season_year, week_number, kind, slug, title, summary, intro_markdown, outro_markdown, status, published_at, author_id, author_slug)'
  )
  lines.push(
    `VALUES ('${article.id}', ${article.seasonYear}, ${article.weekNumber}, '${article.kind}', ${sqlString(article.slug)}, ${sqlString(article.title)}, ${sqlString(article.summary)}, ${sqlString(article.introMarkdown)}, ${sqlString(article.outroMarkdown)}, '${article.status}', ${sqlString(article.publishedAt)}, NULL, ${sqlString(article.authorSlug)})`
  )
  lines.push('ON CONFLICT (slug) DO NOTHING;')
  lines.push('')

  if (matchups.length > 0) {
    lines.push(
      'INSERT INTO article_matchups (id, article_id, position, slot_label, away_team_name, home_team_name, away_record, home_record, line, away_score, home_score, body)'
    )
    lines.push('VALUES')
    lines.push(
      matchups
        .map((m, i) => {
          const row = `  ('${m.id}', '${article.id}', ${m.position}, ${sqlString(m.slotLabel)}, ${sqlString(m.awayTeamName)}, ${sqlString(m.homeTeamName)}, ${sqlString(m.awayRecord)}, ${sqlString(m.homeRecord)}, ${sqlString(m.line)}, ${sqlNumber(m.awayScore)}, ${sqlNumber(m.homeScore)}, ${sqlString(m.body)})`
          return row + (i === matchups.length - 1 ? '' : ',')
        })
        .join('\n')
    )
    lines.push('ON CONFLICT (article_id, position) DO NOTHING;')
  }
  lines.push('')
  return lines.join('\n')
}

function renderReviewSection({ relPath, warnings }) {
  const lines = [`## ${relPath}`, '']
  if (warnings.length === 0) {
    lines.push('- No issues flagged.')
  } else {
    for (const w of warnings) lines.push(`- ${w}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null
  const dryRun = args.includes('--dry-run')

  if (fileArg) {
    console.log(JSON.stringify(parseArticle(fileArg), null, 2))
    return
  }

  const results = readArticleFiles().map(parseArticle)

  const sql = ['BEGIN;', ''].concat(results.map(renderArticleSql)).concat(['COMMIT;']).join('\n')
  const review = ['# Backfill review\n'].concat(results.map(renderReviewSection)).join('\n')

  if (dryRun) {
    console.log(sql)
    console.log('\n---REVIEW---\n')
    console.log(review)
    return
  }

  fs.writeFileSync(SQL_OUTPUT, sql)
  fs.writeFileSync(REVIEW_OUTPUT, review)

  const totalMatchups = results.reduce((n, r) => n + r.matchups.length, 0)
  const totalWarnings = results.reduce((n, r) => n + r.warnings.length, 0)
  console.log(`Wrote ${SQL_OUTPUT}`)
  console.log(`Wrote ${REVIEW_OUTPUT}`)
  console.log(
    `${results.length} articles, ${totalMatchups} matchups, ${totalWarnings} warnings to review`
  )
}

main()
