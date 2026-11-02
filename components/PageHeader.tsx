import { ReactNode } from 'react'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  /**
   * `page` is the large public-facing header (also used on the admin dashboard and API docs).
   * `section` is the smaller header for admin working pages (Articles, Poll, Commissioner Tools).
   */
  variant?: 'page' | 'section'
}

export default function PageHeader({ title, subtitle, variant = 'page' }: Props) {
  if (variant === 'section') {
    return (
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100">{title}</h1>
        {subtitle && <p className="text-gray-600 dark:text-gray-400">{subtitle}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2 pb-8 pt-6 md:space-y-5">
      <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
        {title}
      </h1>
      {subtitle && <p className="text-lg leading-7 text-gray-600 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}
