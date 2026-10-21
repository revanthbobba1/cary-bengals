import { timingSafeEqual } from 'crypto'

// Shared by both app/api/espn/*/route.ts handlers so the secret check can't drift between them --
// this gate must run, and must run correctly, BEFORE lib/supabase/serviceRole.ts is ever touched.
export function verifyCronSecret(request: Request): boolean {
  const provided = request.headers.get('x-cron-secret')
  const expected = process.env.ESPN_SYNC_CRON_SECRET

  if (!provided || !expected) return false

  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch rather than returning false, and a wrong-length
  // guess is itself not a secret worth comparing further.
  if (providedBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(providedBuffer, expectedBuffer)
}
