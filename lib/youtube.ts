/**
 * Extracts the video ID from a YouTube URL, handling both forms seen in this app's data:
 * `youtube.com/watch?v=ID` and the share-link form `youtu.be/ID?si=...`. Returns null for
 * anything else (including Spotify links, or malformed input), so callers can use it directly as
 * a "is this actually a YouTube link" check.
 */
export function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1)
      return id || null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return parsed.searchParams.get('v')
    }

    return null
  } catch {
    return null
  }
}

/** The video's own thumbnail, served directly by YouTube -- no API key needed. */
export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}
