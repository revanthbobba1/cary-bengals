import Link from '@/components/Link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-start justify-start md:mt-24 md:flex-row md:items-center md:justify-center md:space-x-6">
      <div className="space-x-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-6xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 md:border-r-2 md:border-gray-200 md:px-6 md:text-8xl md:leading-14 dark:md:border-gray-800">
          404
        </h1>
      </div>
      <div className="max-w-md">
        <p className="mb-4 text-xl font-bold leading-normal md:text-2xl">
          Sorry, we couldn&apos;t find this page.
        </p>
        <p className="mb-8 text-gray-500 dark:text-gray-400">
          But don&apos;t worry, you can find plenty of other things on our homepage.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}
