# ESPN Fantasy API Integration — Plan

Living document for pulling team data (and eventually rosters/scores/schedule) from ESPN's
fantasy football API into the Supabase-backed poll system. See `POLL_SYSTEM_PLAN.md` for the
poll feature this replaces manual team entry for.

Last reviewed: 2026-08-15

## 1. Goal

Replace the hand-written SQL seed of the `teams` table (`supabase/migrations/005_insert_2026_teams.sql`)
with a commissioner-triggered sync from ESPN's fantasy football API, starting with team names
only. Design the pipeline so rosters, scores, standings, and schedule data can be layered on
later without reworking the architecture.

A secondary goal of this feature is deliberate exposure to a new stack — a genuine middle-tier
service, separate from the Next.js app, rather than folding ESPN calls into a Route Handler.
Some added complexity here is accepted in service of that, but should stop short of significant
overengineering for the actual job.

## 2. Decisions

### 2.1 Middle-tier stack: FastAPI (Python 3.12)

Considered against Flask (the existing unused skeleton at `backend/`), Express, and NestJS.

**Why FastAPI, specifically (not just "the trendy pick"):**

- Pydantic v2 models with `extra="ignore"` are the sanitization boundary, declaratively — ESPN's
  API is undocumented and can add/change fields without warning; validation-as-schema means that
  shows up as a clean typed error, not a silent bad write.
- Free OpenAPI 3.1 schema at `/openapi.json` → run `openapi-typescript` against it to generate
  `lib/types/espn-api.d.ts` in the Next app. The contract between the two tiers is typed
  end-to-end from one source of truth, with no hand-maintained duplicate interfaces. This is the
  strongest concrete (non-hype) justification for a separate tier over a Route Handler.
- **Honest caveat:** the async I/O advantage is oversold for this use case — traffic is a
  commissioner clicking "sync" a handful of times a season, so sync Flask would perform
  indistinguishably. The real wins are the validation/sanitization fit and the typed-contract
  generation, not concurrency.

**Why not the alternatives:**

- Flask (existing skeleton) — gets you most of this with `flask-pydantic`/`flask-smorest`, but
  bolted on rather than native; the skeleton itself (`backend/app.py`, `base.py`, `routes/`) is a
  hardcoded stub nothing references, safe to replace wholesale.
- Express — same language already used daily on the frontend; no new exposure.
- NestJS — a full DI/IoC framework is real overengineering for one (eventually a few) read
  endpoints.
- Django REST Framework — ORM-centric, built for owning its own database; this service is
  intentionally stateless.

### 2.2 Service is stateless and read-only

FastAPI fetches and sanitizes ESPN data only. It never writes to Supabase. The Next.js Route
Handler that calls it owns the diff/upsert into `teams`. This keeps DB credentials and RLS/role
logic (already non-trivial per `POLL_SYSTEM_PLAN.md`) in one place, and gives the service exactly
one secret class (ESPN cookies) and one failure mode.

### 2.3 Sync key: `espn_team_id`, not name, not owner ID

Team names change mid-season (part of the fun of the league) — syncing on name would create
duplicate `teams` rows on every rename and silently split historical `poll_submissions`/
`poll_results` data across two "teams." Owner ID was considered but rejected as the _primary_ key
because ESPN's `owners[]` field can hold multiple IDs for a co-owned team, making it ambiguous as
a sole match key.

`espn_team_id` is what ESPN treats as the one stable, singular identifier for a roster/record
entity for the season — it survives renames and ties directly to the win/loss data already in the
payload. `espn_owner_id` is still captured as a secondary field (for resolving the human owner
name), just not used as the match key.

This also cleanly handles the (very unlikely, per league history) case of an owner being swapped
mid-season: since `espn_team_id` doesn't change, a sync just updates `owner_name`/`espn_owner_id`
on the existing row like any other field — no orphaned historical submissions, no special-case
error handling needed.

**Schema change required** (additive, does not touch the existing `UNIQUE(name, season_year)`
constraint or anything the active P0 submissions bug is investigating):

```sql
-- Shipped as supabase/migrations/034_add_espn_team_ids.sql (015 was taken by the time Phase 5 ran)
ALTER TABLE teams ADD COLUMN espn_team_id INTEGER;
ALTER TABLE teams ADD COLUMN espn_owner_id TEXT;
ALTER TABLE teams ADD COLUMN espn_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX teams_season_espn_id
  ON teams(season_year, espn_team_id) WHERE espn_team_id IS NOT NULL;
```

Sync upserts on `(season_year, espn_team_id)` going forward. The 12 existing 2026 rows have no
ESPN IDs yet — first sync runs in **preview mode**: show a side-by-side diff (existing row ↔
proposed ESPN match, fuzzy-matched on name/owner), let the commissioner confirm pairings, then
commit. Never blind-overwrite on first run.

### 2.4 Owner name: commissioner-owned, ESPN is a suggestion only

ESPN's `displayName` is frequently an autogenerated username (e.g. `espnfan12345678`) rather than
a real name, and not all league members have necessarily set a real display name on their ESPN
account. Sync never silently overwrites `owner_name`. The preview UI shows ESPN's value alongside
the existing curated value; the commissioner explicitly chooses whether to accept it. Default/
fallback is always the existing value — nothing changes unless the commissioner acts.

(Separately, the commissioner can ask league members to set a real ESPN display name so future
syncs need fewer manual overrides — a process fix, not something the app needs to enforce.)

### 2.5 Scope: 2026 forward only

No backfill of 2024/2025 through ESPN. This drops the need for the `location`+`nickname` name
fallback (pre-2018-style payloads) and the `leagueHistory` endpoint's array-shaped response —
both only matter for historical seasons.

### 2.6 Deployment: Render (free tier)

Netlify can't host a long-running Python process. Render's free-tier cold start (~60s after 15min
idle) is normally disqualifying but is irrelevant here by design — the only caller is a
commissioner-triggered sync a few times a season, and every public page reads Supabase directly,
never this service. Ship a `Dockerfile` from day one so moving to Fly.io/Cloud Run later (if
traffic patterns ever change) is a config change, not a rewrite.

## 3. ESPN API — research findings

No official docs; reverse-engineered, community-documented. Confirmed across multiple sources
(see §7).

- **Base host:** `https://lm-api-reads.fantasy.espn.com/apis/v3/games/` (current, read-optimized
  host ESPN moved to ~April 2024).
- **League endpoint (2018+):**
  `GET {base}ffl/seasons/{season}/segments/0/leagues/{leagueId}?view=mTeam`
- **Views** are additive query params (`?view=mTeam&view=mRoster`). Known: `mTeam`, `mRoster`,
  `mMatchup`, `mMatchupScore`, `mScoreboard`, `mSchedule`, `mStandings`, `mSettings`,
  `mBoxscore`, `mDraftDetail`, `mLiveScoring`, `kona_player_info`, `player_wl`.
- **Team payload shape** (`view=mTeam`): `teams[]` → `id`, `abbrev`, `name`, `owners[]` (GUID
  strings), `primaryOwner`, `record.overall.{wins,losses,ties,pointsFor,pointsAgainst}`.
  `members[]` → `id` (matches `owners[]`), `displayName`, `firstName`, `lastName`.
- **Private-league auth:** `espn_s2` (long opaque string) + `SWID` cookies — **braces are part of
  the `SWID` value** (`{1E6CC139-...}`). No cookies + private league → 401. Wrong league ID → 404.
- **Rate limits:** undocumented; excessive volume can 429 or temporarily block the IP. Mitigate
  with server-side caching (15-min TTL is plenty for team names), no bursts, backoff with jitter
  honoring `Retry-After`.
- **`X-Fantasy-Filter` header:** required for player-heavy views (`kona_player_info`) to avoid a
  50-item cap. Not needed for team names; client should accept it from day one so rosters don't
  force a rewrite later.
- **ToS posture:** community consensus (not legal advice) is that using your own cookies to read
  your own league for personal use isn't a ToS problem — but it's still undocumented and can
  change or block without notice. Design must degrade gracefully (surface a clear error, fall
  back to the existing manual-entry path — never make sync load-bearing).

## 4. Service architecture

Replace `backend/` contents entirely (delete `base.py`, `app.py`, `routes/`, `.flaskenv`,
stale `requirements.txt`):

```
backend/
  pyproject.toml            # deps + ruff/black/pytest config
  Dockerfile
  .env.example
  app/
    main.py                 # app factory, CORS, exception handlers, lifespan
    config.py               # pydantic-settings Settings
    security.py             # shared-secret header dependency
    cache.py                # async TTL cache
    clients/espn.py         # thin async httpx wrapper around ESPN — the only HTTP-layer code
    schemas/espn_raw.py     # Pydantic models mirroring ESPN — the sanitization boundary
    schemas/api.py          # our outward DTOs — the stable contract (TeamOut today)
    services/league.py      # orchestration: fetch → parse → map
    routers/health.py       # /healthz, /readyz
    routers/league.py       # /v1/league/{season}/teams
  tests/
    fixtures/mteam_2026.json   # redacted capture of a real payload
    test_sanitize.py
    test_league_route.py
```

Write a small (~60-line) `httpx.AsyncClient` wrapper rather than depending on the community
`cwendt94/espn-api` package — that package is sync/`requests`-based (fights FastAPI's async
model) and wraps the payload in its own object model. Read its source as a spec/reference for the
payload shape, don't import it.

**Why this survives adding rosters/scores/schedule later:** `clients/espn.py` exposes one
primitive (`fetch_league(season, views, x_fantasy_filter=None)`); adding rosters is just passing
`["mRoster"]` instead of `["mTeam"]`. `schemas/espn_raw.py` and `schemas/api.py` each grow one
model per new view; existing models are untouched. Routes are versioned under `/v1` so a future
breaking reshape becomes `/v2` rather than a silent frontend break.

## 5. Data flow

**Pull:** `GET {base}ffl/seasons/{season}/segments/0/leagues/{leagueId}?view=mTeam`, cookies
attached if the league is private. Cache parsed result in-process, 15-min TTL keyed on
`(season, views)`.

**Sanitize** (in order):

1. Structural — Pydantic `extra="ignore"` models; missing required fields raise `ValidationError`
   → clean 502, never a partial write.
2. Name resolution — `name` if present/non-blank; otherwise skip the team and report in
   `warnings[]` (no `location`+`nickname` fallback needed given 2026-forward-only scope).
3. String hygiene — Unicode NFKC normalize, strip control/zero-width/bidi-override chars, strip
   HTML tags, collapse whitespace, trim, cap length.
4. **Explicitly preserve emoji and punctuation** — existing seeded data includes names like
   `'Heterophobes Reloaded 😈 (Joseph)'` and `'Code Monkey (PR #414) (Ankith)'`. A naive
   alphanumeric-only filter would corrupt real data.
5. Owner name — resolve `primaryOwner` → `members[].id` → `displayName`; never auto-applied (see
   §2.4) — surfaced as a suggestion only.
6. Never echo raw ESPN JSON through our API — `TeamOut` is the only shape that leaves the service.
7. Never log `espn_s2`/`SWID` — redact in exception handlers and HTTP client logging.

**Serve:**

```json
GET /v1/league/{season}/teams
{
  "season": 2026,
  "league_id": "...",
  "fetched_at": "2026-08-15T...",
  "teams": [
    { "espn_team_id": 3, "name": "...", "espn_owner_id": "{GUID}",
      "owner_display_name": "...", "record": { "wins": 0, "losses": 0, "ties": 0 } }
  ],
  "warnings": []
}
```

`record` is included even though not needed yet — it's free in the `mTeam` payload, and having it
present means wiring it into `poll_results.team_record` later is a frontend-only change.

## 6. How Next.js calls it

Server-side only — the browser never talks to FastAPI directly.

```
Commissioner clicks "Sync teams from ESPN" at /admin/poll/manage
  → POST /api/admin/teams/sync   (Next Route Handler)
      ├─ getUser() + isCommissioner()   ← reuses lib/supabase/roles.ts
      ├─ GET {ESPN_SERVICE_URL}/v1/league/2026/teams   (FastAPI, read-only)
      ├─ diff against Supabase teams WHERE season_year = 2026, matched on espn_team_id
      └─ return preview → commissioner confirms/edits owner names → second call upserts
```

`lib/espn/client.ts` — typed fetch wrapper reading `ESPN_SERVICE_URL` / `ESPN_SERVICE_TOKEN`
(both server-only, no `NEXT_PUBLIC_` prefix), sending the token as a header. No CORS/CSP changes
needed (`next.config.js` already has permissive `connect-src`, though nothing depends on it since
this never runs client-side).

## 7. Sources

- [Steven Morse — ESPN Fantasy API v3](https://stmorse.github.io/journal/espn-fantasy-v3.html)
- [nntrn ESPN endpoints gist](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c)
- [cwendt94/espn-api](https://github.com/cwendt94/espn-api) (reference for payload shape only —
  not a dependency, see §4)
- [ffscrapr — ESPN Private Leagues](https://ffscrapr.ffverse.com/articles/espn_authentication.html)
- [mkreiser/ESPN-Fantasy-Football-API](http://espn-fantasy-football-api.s3-website.us-east-2.amazonaws.com/)

## 8. Open — resolved 2026-09-09

1. **Public or private league?** Test with an unauthenticated request to the league endpoint:
   200 with populated `teams[]` = public; 401 = private; 404 = wrong league ID.
   **Private** — confirmed via an unauthenticated `curl` to the league endpoint, which returned
   401 (`AUTH_LEAGUE_NOT_VISIBLE`).
2. **League ID** — from the ESPN league URL. **`19467081`.**
3. **If private: `espn_s2` + `SWID` cookies** — from browser DevTools → Application → Cookies →
   `fantasy.espn.com`, on a logged-in session. Keep the braces on `SWID`. These expire (commonly
   ~1yr, or earlier on password change/logout) — the sync UI must surface a 401 as "ESPN
   credentials expired, re-capture cookies," not fail silently. Store as Render env vars, never
   in the repo. **Captured and verified** — an authenticated `curl` with both cookies returned 200
   with all 12 teams. Not stored anywhere in this repo or on disk; held by the user until the
   Phase 4 Render deploy needs them as env vars.

## 9. Sequencing

| Phase | Work                                                                                              | Blocked by                   |
| ----- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0 ✅  | Answer §8 (public/private, league ID, cookies if needed)                                          | **User**                     |
| 1 ✅  | Hand-probe the API with `curl`; capture + redact a real payload into `tests/fixtures/`            | 0                            |
| 2 ✅  | Scaffold FastAPI; delete Flask files; `/healthz` + `/v1/league/{season}/teams`; run locally       | 1                            |
| 3 ✅  | Sanitization + pytest against the captured fixture (`respx` for HTTP mocking)                     | 2                            |
| 4     | Dockerize; deploy to Render; set secrets                                                          | 3                            |
| 5     | Migration `034_add_espn_team_ids.sql` (renumbered — `015` was taken by the time this ran)         | independent, can run anytime |
| 6     | `lib/espn/client.ts` + `app/api/admin/teams/sync/route.ts` (commissioner-gated) + preview/diff UI | 4, 5                         |
| 7     | Backfill the 12 existing rows through the preview UI                                              | 6                            |
| 8     | Layer on: `/rosters`, `/standings` → `poll_results.team_record`, `/scoreboard`, `/schedule`       | later                        |

**Phase 1 notes (2026-09-09):** Captured `?view=mTeam` for season 2026 (12 teams, 13 members —
one team is co-owned). Real member names, `displayName`s, and GUIDs (`members[].id`,
`teams[].owners`, `teams[].primaryOwner`) were replaced with synthetic placeholders before the
file touched the repo; two team logo URLs that embedded a real member's name in the path
(`.../BlitznBears-MartinLaksman/...`) were genericized the same way. `notificationSettings`
(15 entries per member, irrelevant to this integration) were dropped to keep the fixture
readable — every field the sanitizer in §5 actually reads is preserved untouched, plus several
genuinely unused fields (`draftStrategy`, `tradeBlock`, `transactionCounter`, `valuesByStat`) left
in as-is specifically so Phase 3's `extra="ignore"` test has real noise to ignore. Saved to
`backend/tests/fixtures/mteam_2026.json`.

**Phase 2 notes (2026-09-09):** Scaffolded per §4's layout, built and run with `uv` (Python 3.12,
venv at `backend/env` per §10's friction note — already covered by the pre-existing `env` entry
in the root `.gitignore`). Old Flask skeleton (`app.py`, `base.py`, `routes/`, `.flaskenv`,
`requirements.txt`) deleted wholesale per §2.1. `clients/espn.py` exposes the single
`fetch_league(season, views, x_fantasy_filter)` primitive from §4, raising typed
`EspnAuthError`/`EspnNotFoundError`/`EspnRequestError` that `routers/league.py` maps to a 502 with
a clear message (never a silent failure, per §8 item 3). `services/league.py` implements the §5
sanitize pipeline (NFKC normalize, strip control/zero-width/bidi-override chars via explicit
codepoint ranges — not literal invisible characters in source — strip HTML, collapse whitespace,
cap length; emoji/punctuation preserved). `cache.py` is a single-lock async TTL cache — traffic
here is a commissioner clicking "sync" a few times a season, so per-key locking would be
unjustified complexity. `security.py` gates `/v1/*` on a shared-secret `X-Service-Token` header,
matching §6's Next.js-only caller design (no CORS middleware added — the browser never calls this
service directly). Verified end-to-end against the real league, not just unit-level: local
`uvicorn` run, `/healthz` and `/readyz` both 200, `/v1/league/2026/teams` returns all 12 teams
correctly sanitized (emoji and apostrophes intact, e.g. `Bark For Daddy!🫵🐶`, `Ladd's Lads`) with
`owner_display_name` populated as a suggestion only (never applied anywhere yet — that's Phase 6's
preview UI), a second request returns an identical `fetched_at` confirming the cache hit, a
missing/wrong `X-Service-Token` returns 401, and `/openapi.json` serves correctly for the future
`openapi-typescript` step. `ruff check` and `black --check` both pass; `package.json`'s
`lint-staged` gained the `backend/**/*.py` entry §10 flagged as missing, using
`uv run --project backend` so it resolves the `backend/env` venv from the repo root. Real ESPN
credentials live only in `backend/.env` (gitignored, never committed) — `.env.example` documents
the required keys with no real values.

**Phase 2 review fixes (2026-09-09):** Two findings from the automated review addressed before
merge: `security.py`'s token check now uses `hmac.compare_digest` (closing a timing side-channel
on the shared secret), and `config.py` gained a `model_validator` that fails startup clearly if
only one of `ESPN_S2`/`ESPN_SWID` is set, instead of silently sending no cookies and surfacing a
generic 401 later. A third finding (the single-lock `TTLCache` serializing unrelated keys across
a slow fetch) was deliberately left as-is — the only caller is a commissioner clicking "sync" a
handful of times a season, so there's no concurrent-key traffic to actually serialize, and
per-key locking would be real complexity for a race that can't occur at this scale.

**Phase 3 notes (2026-09-09):** `tests/test_sanitize.py` unit-tests `_sanitize_name` (control/HTML
stripping, emoji and punctuation preservation, length capping) and `get_league_teams` end-to-end
against the real (redacted) `mteam_2026.json` fixture from Phase 1 — including confirming
`RawLeagueResponse`'s `extra="ignore"` swallows unknown fields and a missing required field raises
`ValidationError`. `tests/test_league_route.py` uses `respx` to mock ESPN at the HTTP layer and
drives the actual FastAPI app through `TestClient`, covering the service-token gate, the
sanitized-response shape, the TTL cache (asserting the mocked route is hit exactly once across two
requests), and both ESPN error paths (401 → 502 "credentials expired", 404 → 502 "not found").
`tests/conftest.py` overrides settings via `monkeypatch.setenv` + `get_settings.cache_clear()` so
tests never touch the real values in `backend/.env`. Needed one infra fix along the way: pytest
couldn't import the `app` package until `pythonpath = ["."]` was added to `[tool.pytest.ini_options]`
(the `tests/` directory has no `__init__.py`, so pytest's default import-mode never added
`backend/` itself to `sys.path`). Also fixed a real (if minor) issue surfaced by running the new
suite: `EspnClient` was passing `cookies=` per-request, which newer `httpx` flags as deprecated —
cookies now get set once on the shared client instance in `__init__` instead, verified against the
real league again afterward to confirm auth still works. 16 tests, all passing; `ruff`/`black`
clean.

**Phase 5 notes (2026-09-10):** Written out of numeric order relative to Phases 2-3 since it's
independent (per §9) and doesn't need the FastAPI service running. Shipped as
`034_add_espn_team_ids.sql`, not `015` — this repo's migration numbering had moved on since this
plan was first drafted; `015` was already `015_fix_submission_rls.sql`. Matches §2.3 exactly
(additive, partial unique index on `(season_year, espn_team_id)`), with one addition: `lib/types/poll.ts`'s
`Team` interface picked up the three new nullable fields in the same PR, ahead of any code
actually reading them, so the TypeScript type doesn't silently drift from the live schema — `tsc
--noEmit` confirmed this is a no-op for every existing consumer (`Team[]`/`PollResultWithTeam[]`
usages throughout, no object literals constructing a `Team` field-by-field). **Not yet applied to
production** — the migration file is written and reviewed, but `supabase db push` is a separate,
deliberate step against the live database, held pending explicit go-ahead rather than bundled into
the PR-merge-to-`develop` flow the rest of this work has used.

## 10. Anticipated friction

- **Netlify build gate** — `yarn lint`/Prettier failures break CI (see commit `b7536f5`). New
  `.ts`/`.tsx` files must be clean before push.
- **Two toolchains** — `.husky/pre-commit` → `lint-staged` currently only globs JS/TS/JSON/CSS/MD.
  Add a `"backend/**/*.py": ["ruff check --fix", "black"]` entry or Python formatting drifts
  unchecked.
- **`.gitignore` already anticipates a Python backend** — has `backend/env` and
  `backend/__pycache__` entries; put the venv at `backend/env` to match. Add `backend/.env`.
- **Sync must never be load-bearing.** If ESPN changes shape or blocks the IP, fall back to the
  existing manual SQL/Dashboard path for teams — don't remove that path.
- **Sequencing vs. the P0 bug** — this work is safe to build now per `POLL_SYSTEM_PLAN.md` §5,
  but Phase 5 touches `teams`, which `poll_submissions` FKs into. Keeping that migration strictly
  additive (§2.3) is what keeps it safe to do in parallel with the P0 investigation.

## 11. Critical files

- `backend/app.py`, `base.py`, `routes/`, `requirements.txt`, `.flaskenv` — all replaced by the
  FastAPI service
- `supabase/migrations/001_create_poll_tables.sql` — the `teams` schema `034_add_espn_team_ids.sql`
  extends
- `app/admin/poll/manage/page.tsx` — commissioner-gated page hosting the new sync/preview UI
- `lib/types/poll.ts` — `Team` interface gained `espn_team_id`/`espn_owner_id`/`espn_synced_at` in
  Phase 5, ahead of any code actually reading them, so the type never lies about the live schema
- `lib/supabase/roles.ts` — `isCommissioner()` gates the new `/api/admin/teams/sync` Route Handler
