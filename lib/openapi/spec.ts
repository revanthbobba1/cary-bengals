// OpenAPI document behind the admin API docs page (/admin/api-docs). The Next.js routes are
// described by hand below -- keep this in sync when adding or changing a handler under app/api/
// or app/feed.xml/. The ESPN service's paths come from backend/openapi.json, generated from the
// FastAPI app (see backend/scripts/export_openapi.py; a backend test fails if it goes stale).

import espnServiceSpec from '../../backend/openapi.json'

const cronSecretScheme = {
  type: 'apiKey',
  in: 'header',
  name: 'x-cron-secret',
  description:
    'Must equal the `ESPN_SYNC_CRON_SECRET` environment variable. See "Getting credentials" ' +
    'in the API description above for where to find it.',
} as const

const unauthorized = {
  description: 'Missing or incorrect `x-cron-secret` header.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
}

const serverError = {
  description: 'The sync failed.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
}

// Pliny's NewsletterAPI route handler is exported for both verbs but reads the email from a JSON
// body either way, so a bodiless GET fails. One shared operation, with the caveat in the text.
const newsletterOperation = {
  tags: ['Site: content'],
  summary: 'Subscribe an email to the newsletter',
  description:
    "Handled by Pliny's `NewsletterAPI` for the provider in `siteMetadata.newsletter`. The email " +
    'is read from a JSON request body on both verbs, so use POST; a GET without a body fails ' +
    'with 500. A provider error status (>= 400) is passed through.',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
      },
    },
  },
  responses: {
    '201': {
      description: 'Subscribed.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Successfully subscribed to the newsletter' },
            },
          },
        },
      },
    },
    '400': {
      description: 'No `email` in the body.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
    '500': {
      description: 'Provider not supported or not configured, or an unexpected failure.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  },
}

const nextjsPaths = {
  '/api/espn/sync-all': {
    post: {
      tags: ['Site: ESPN sync'],
      summary: 'Run the full ESPN refresh',
      description:
        'Refreshes team names, rosters, team records and matchups for the current season ' +
        '(`siteMetadata.currentSeason`) by reading the ESPN service and writing to Supabase with ' +
        'the service-role key. The four refreshes run independently: one failing does not undo ' +
        'the others, and is reported in `warnings` with a 200. Only a total failure returns 500. ' +
        'Called by the `espn-full-sync` Netlify scheduled function Tuesday-Friday, and ' +
        'equivalent to the commissioner\'s "Refresh ESPN Data" button.',
      security: [{ cronSecret: [] }],
      responses: {
        '200': {
          description: 'Refresh finished; `warnings` lists any step that failed.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/EspnDataRefreshResult' } },
          },
        },
        '401': unauthorized,
        '500': serverError,
      },
    },
  },
  '/api/espn/sync-matchups': {
    post: {
      tags: ['Site: ESPN sync'],
      summary: 'Sync live matchups and box scores',
      description:
        'Syncs matchup totals and projections first, then player box scores (which depend on ' +
        'the matchup rows existing). A box-score failure is reported in `warnings` with a 200 ' +
        'and `boxScoreSideCount: 0`, not a 500, so the committed matchup sync stays visible. ' +
        "Assumes the ESPN service is already warm and is bound by Netlify's sync-function " +
        'timeout. Called by the `espn-matchup-sync` Netlify scheduled function every ~10 minutes ' +
        'during live game windows.',
      security: [{ cronSecret: [] }],
      responses: {
        '200': {
          description: 'Matchups synced; `warnings` lists a box-score failure if one occurred.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/MatchupSyncResult' } },
          },
        },
        '401': unauthorized,
        '500': serverError,
      },
    },
  },
  '/api/search-index': {
    get: {
      tags: ['Site: content'],
      summary: 'Search index of published articles',
      description:
        'Public. One entry per published article, with the summary and matchup text folded into ' +
        '`summary` as search keywords. Revalidated every 5 minutes; feeds the command-palette ' +
        'search.',
      responses: {
        '200': {
          description: 'One document per published article.',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/SearchDocument' },
              },
            },
          },
        },
        '500': {
          description: 'Articles could not be loaded.',
          content: { 'text/plain': { schema: { type: 'string' } } },
        },
      },
    },
  },
  '/feed.xml': {
    get: {
      tags: ['Site: content'],
      summary: 'RSS feed of published articles',
      description:
        'Public. RSS 2.0 feed of published articles, newest first. Revalidated every 5 minutes.',
      responses: {
        '200': {
          description: 'RSS 2.0 document.',
          content: { 'application/xml': { schema: { type: 'string' } } },
        },
      },
    },
  },
  '/api/newsletter': {
    get: newsletterOperation,
    post: newsletterOperation,
  },
}

const nextjsSchemas = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'What went wrong.', example: 'Unauthorized' },
    },
  },
  EspnDataRefreshResult: {
    type: 'object',
    properties: {
      namesUpdated: { type: 'integer', description: 'Teams whose name changed.', example: 1 },
      teamCount: { type: 'integer', description: 'Teams whose rosters were synced.', example: 12 },
      playerCount: { type: 'integer', description: 'Roster players written.', example: 312 },
      recordsUpdated: { type: 'integer', description: 'Teams whose W-L-T changed.', example: 12 },
      matchupsUpdated: { type: 'integer', description: 'Matchups written.', example: 84 },
      boxScoreSideCount: {
        type: 'integer',
        description: 'Matchup sides whose player scores were written.',
        example: 12,
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'One message per step that failed or skipped an item. Empty when clean.',
        example: [],
      },
    },
  },
  MatchupSyncResult: {
    type: 'object',
    properties: {
      matchupCount: { type: 'integer', description: 'Matchups written.', example: 84 },
      boxScoreSideCount: {
        type: 'integer',
        description: 'Matchup sides whose player scores were written; 0 if box scores failed.',
        example: 12,
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Matchup-sync warnings plus a "Box score refresh failed" entry if applicable.',
        example: [],
      },
    },
  },
  SearchDocument: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Site-relative path.',
        example: 'articles/week-1-power-rankings',
      },
      title: { type: 'string', example: 'Week 1 Power Rankings' },
      summary: {
        type: 'string',
        description: 'Summary plus matchup text, used as search keywords.',
      },
      date: { type: ['string', 'null'], format: 'date-time' },
    },
  },
}

const espnServicePaths = Object.fromEntries(
  Object.entries(espnServiceSpec.paths).map(([path, item]) => [
    path,
    {
      ...item,
      // Not served by this site: the service is private, called only from server code.
      servers: [{ url: 'https://<ESPN_SERVICE_URL>', description: 'Private ESPN service' }],
    },
  ])
)

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Cary Bengals API',
    version: '1.0.0',
    description:
      'Every HTTP endpoint in the application. **Site** endpoints are served by this Next.js ' +
      'app. **ESPN service** endpoints belong to the private FastAPI service in `backend/`, ' +
      'which only server code may call (header `X-Service-Token`); the "Try it out" button will ' +
      'not reach it from the browser.\n\n' +
      '## Getting credentials\n\n' +
      'Secrets are never shown in the app. To call an endpoint yourself, copy the value from ' +
      'where it is configured:\n\n' +
      '| Header | Used by | Environment variable | Where to find it |\n' +
      '| --- | --- | --- | --- |\n' +
      '| `x-cron-secret` | `POST /api/espn/sync-all`, `POST /api/espn/sync-matchups` | ' +
      '`ESPN_SYNC_CRON_SECRET` | Netlify site settings, Environment variables. For local dev, ' +
      '`.env.local`. |\n' +
      '| `X-Service-Token` | ESPN service `/v1/*` | `ESPN_SERVICE_TOKEN` on the site; ' +
      '`SERVICE_TOKEN` on the service | The same value is set in both: Netlify environment ' +
      'variables and the Render service environment. For local dev, `.env.local` and ' +
      '`backend/.env`. |\n\n' +
      'Example (replace the URL and secret):\n\n' +
      '```bash\n' +
      'curl -X POST https://cary-bengals.netlify.app/api/espn/sync-all \\\n' +
      '  -H "x-cron-secret: $ESPN_SYNC_CRON_SECRET"\n' +
      '```\n\n' +
      'Treat both as passwords: the cron secret unlocks a route that writes to the database ' +
      'with the Supabase service-role key. The sync routes already run on a Netlify schedule, ' +
      'and commissioners can run a refresh from **Commissioner Tools** without any secret, so ' +
      'call these by hand only for troubleshooting.',
  },
  servers: [{ url: '/' }],
  paths: {
    ...nextjsPaths,
    ...espnServicePaths,
  },
  components: {
    securitySchemes: {
      cronSecret: cronSecretScheme,
      ...espnServiceSpec.components.securitySchemes,
    },
    schemas: { ...nextjsSchemas, ...espnServiceSpec.components.schemas },
  },
}
