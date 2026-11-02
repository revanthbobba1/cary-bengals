import { loadHomeSnapshot } from '@/lib/home/homeData'
import Main from './Main'

// Rendered on every request: standings, scores, polls and articles all change out-of-band (ESPN
// sync, commissioner actions) and revalidatePath() doesn't reliably purge Netlify's cache -- see
// docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness". Each section degrades independently
// inside loadHomeSnapshot, so a failed query never blanks the page.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const snapshot = await loadHomeSnapshot()
  return <Main snapshot={snapshot} />
}
