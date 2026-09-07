import Image from './Image'
import Link from './Link'
import { getBlurProps } from '@/lib/blurPlaceholders'
import { focusRingClasses } from '@/lib/focusRing'

const Card = ({ title, description, imgSrc, href }) => {
  const content = (
    <div className="group h-full overflow-hidden rounded-card border border-gray-200 bg-white shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:border-gray-300 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:border-gray-700 dark:hover:shadow-raised-dark">
      {imgSrc && (
        <div className="overflow-hidden">
          <Image
            alt={title}
            src={imgSrc}
            className="object-cover object-center transition-transform duration-300 ease-out-expo group-hover:scale-105 md:h-36 lg:h-48"
            width={544}
            height={306}
            {...getBlurProps(imgSrc)}
          />
        </div>
      )}
      <div className="p-6">
        <h2 className="mb-3 text-xl font-bold tracking-tight text-ink transition-colors duration-150 ease-out-expo group-hover:text-accent-500 dark:text-gray-100 dark:group-hover:text-accent-400">
          {title}
        </h2>
        <p className="prose mb-3 max-w-none text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
        {href && (
          <span className="inline-flex items-center text-sm font-semibold text-primary-500 dark:text-primary-400">
            Watch
            <span className="ml-1 inline-block w-0 overflow-hidden opacity-0 transition-all duration-200 ease-out-expo group-hover:ml-1 group-hover:w-3 group-hover:opacity-100">
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="M2.5 6h7M6.5 2.5L10 6l-3.5 3.5" />
              </svg>
            </span>
          </span>
        )}
      </div>
    </div>
  )

  return (
    <div className="max-w-[544px] p-4 md:w-1/2">
      {href ? (
        <Link
          href={href}
          aria-label={`Link to ${title}`}
          className={`block h-full rounded-card transition-transform duration-150 ease-out-expo ${focusRingClasses} active:scale-[0.99]`}
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  )
}

export default Card
