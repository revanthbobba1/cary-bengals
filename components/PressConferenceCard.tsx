import Image from './Image'
import Link from './Link'
import Logo from '@/data/logo.svg'
import { getBlurProps } from '@/lib/blurPlaceholders'
import { focusRingClasses } from '@/lib/focusRing'
import { getYoutubeThumbnailUrl, getYoutubeVideoId } from '@/lib/youtube'
import type { PressConference } from '@/lib/types/pressConference'

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8ZM9.6 15.5V8.5l6.3 3.5-6.3 3.5Z" />
    </svg>
  )
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.1a.75.75 0 1 1-.4-1.45c4.5-1.1 8.3-.6 11.5 1.3a.75.75 0 0 1 .3 1Zm1.5-3.3a.9.9 0 0 1-1.2.3c-3.2-2-8.1-2.5-11.9-1.4a.9.9 0 1 1-.5-1.7c4.3-1.3 9.7-.7 13.3 1.5a.9.9 0 0 1 .3 1.3Zm.1-3.4C15.3 8.3 8.7 8.1 4.9 9.3a1.1 1.1 0 1 1-.6-2.1c4.4-1.3 11.6-1.1 16.2 1.6a1.1 1.1 0 0 1-1.1 1.9Z" />
    </svg>
  )
}

interface Props {
  conference: PressConference
}

export default function PressConferenceCard({ conference }: Props) {
  const { title, description, youtube_url, spotify_url, thumbnail_url } = conference
  const videoId = getYoutubeVideoId(youtube_url)
  const imgSrc = thumbnail_url || (videoId ? getYoutubeThumbnailUrl(videoId) : null)

  return (
    <div className="max-w-[544px] p-4 md:w-1/2">
      <div className="group h-full overflow-hidden rounded-card border border-gray-200 bg-white shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:border-gray-300 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:border-gray-700 dark:hover:shadow-raised-dark">
        <div className="overflow-hidden">
          {imgSrc ? (
            <Image
              alt={title}
              src={imgSrc}
              className="object-cover object-center transition-transform duration-300 ease-out-expo group-hover:scale-105 md:h-36 lg:h-48"
              width={544}
              height={306}
              {...getBlurProps(imgSrc)}
            />
          ) : (
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 md:h-36 lg:h-48">
              <Logo className="h-12 w-12 text-gray-400 dark:text-gray-600" />
            </div>
          )}
        </div>
        <div className="p-6">
          <h2 className="mb-3 text-xl font-bold tracking-tight text-ink dark:text-gray-100">
            {title}
          </h2>
          {description && (
            <p className="prose mb-3 max-w-none text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
          <div className="flex items-center gap-4">
            {youtube_url && (
              <Link
                href={youtube_url}
                aria-label={`Watch "${title}" on YouTube`}
                className={`inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 transition-colors duration-150 ease-out-expo hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 rounded-control ${focusRingClasses}`}
              >
                <YoutubeIcon />
                YouTube
              </Link>
            )}
            {spotify_url && (
              <Link
                href={spotify_url}
                aria-label={`Listen to "${title}" on Spotify`}
                className={`inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 transition-colors duration-150 ease-out-expo hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 rounded-control ${focusRingClasses}`}
              >
                <SpotifyIcon />
                Spotify
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
