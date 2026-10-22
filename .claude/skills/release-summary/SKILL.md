---
name: release-summary
description: Generates a non-technical, commissioner-facing summary of what's changing in a develop→main release for Cary Bengals Fantasy Football, and posts it as the top of the release PR's description. Use whenever opening or updating a develop→main release PR in this repo — propose it as a standard step, the same way a code-review pass gets proposed.
user-invocable: true
---

# Release summary for the commissioner

This repo's commissioner (the app's primary non-technical user) doesn't need
implementation detail in a release write-up — they need to know what's
actually different for them the next time they use the site. This skill
produces that summary and puts it at the top of the develop→main release
PR's description, above the existing engineering-oriented summary (which
stays as-is below it — don't delete or replace it, this is additive).

## When to run this

Whenever opening or updating a develop→main release PR in this repo,
propose running this and wait for confirmation before posting anything —
same pattern as proposing a code-review pass. Don't run it unprompted on
PRs into `develop` (feature branches) — only release PRs targeting `main`.

## How to gather the changes

List the merged feature PRs (not individual commits — a feature PR is the
right granularity, individual commits are too noisy) that are part of this
release: `gh pr list --base develop --state merged --search "merged:>=<date-of-last-release>"`
or, more reliably, diff the PR titles/numbers between what's already in
`main` and what's in `develop` right now. Read each PR's description for
context rather than re-deriving everything from the raw diff.

## How to decide what belongs in the summary

Include only changes with a **visible, user-facing effect** for one of this
app's actual audiences: the commissioner (admin/commissioner tools), league
members (poll voting, articles, league members page), or public site
visitors. A visible effect means something they would notice or something
that changes what they're able to do.

Leave out, even if the PR spent a lot of effort on it:

- Refactors, renamed files/functions, internal architecture changes
- Bug fixes for bugs that were never actually live/visible in production
  (caught in review before merge, or fixed before the buggy version ever
  shipped)
- Dependency bumps, CI/tooling changes, test additions
- Anything framed around implementation (migrations, RPC names, cache TTLs,
  library choices) — translate the _effect_, never the mechanism

A fix for a bug that _was_ live in production counts as user-facing — write
it as "X now works correctly" / "X no longer happens," not as a bug-fix
changelog entry naming the root cause.

## Writing style

- Plain language only. No file names, function names, migration numbers,
  library names, HTTP/API terms, or words like "refactor," "migration,"
  "RPC," "cache," "Server Action," "revalidate."
- Each item is one short sentence or a short bullet, framed as what changed
  for the reader to notice or do differently — not what the code now does
  internally.
- Group by audience if there's more than one relevant item per audience
  (e.g. "For the commissioner" / "For everyone"), skip empty groups, and
  skip the whole summary (or say "No visible changes in this release" if
  the release really is release-worthy but invisible — e.g. infra-only)
  rather than padding it with internal details to seem substantive.
- Keep the whole thing short — a handful of bullets, not a document. If a
  release genuinely changed a lot for users, that's fine, but don't inflate
  a quiet release to look bigger than it was.

## Example

Given a release that included the ESPN combined-refresh work (PR #114) —
written as an engineer, "combined team-name and roster sync into one
Server Action using Promise.allSettled, fixed a revalidatePath gap on a
statically-rendered page, added a sort_order column" — the commissioner
summary should instead read something like:

```markdown
## What's changing for the commissioner

- Syncing team names and rosters from ESPN is now a single "Refresh ESPN
  Data" button instead of two separate steps — run it anytime a manager
  renames their team or makes a roster move.
- Team roster changes now show up on the League Members page right away
  after a refresh, instead of sometimes needing a wait.
- Player rosters on League Members now list starters and bench in the same
  order you'd see them in the ESPN app, with injured-reserve players
  clearly marked.
```

## Posting it

Add (or update) a `## What's changing for the commissioner` section at the
very top of the release PR's body, above the existing `## Summary` section
— use `gh pr edit <number> --body-file <path>` with the full body
(existing technical content preserved below the new section), the same way
other PR description updates happen in this repo.
