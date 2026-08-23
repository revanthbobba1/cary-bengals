'use client'

import { usePathname } from 'next/navigation'
import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Logo from '@/data/logo.svg'
import Link from './Link'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'
import SearchButton from './SearchButton'
import AuthNav from './AuthNav'
import { useScrolled } from '@/lib/hooks/useScrolled'

const Header = () => {
  const pathname = usePathname()
  const scrolled = useScrolled()

  return (
    // Container + sticky + spacing all live on <header> itself, not a wrapping div — a sticky
    // element can only stay "stuck" for as long as its immediate DOM parent's box is in view,
    // so a tightly-fitting wrapper (sized only by this content) caps the stick range to a few
    // dozen px. Putting everything on <header> makes its real DOM parent <body>, which also
    // holds the rest of the page, so it's always tall enough. The outer gutter is done with
    // responsive margin (not padding) so it survives being on the same element as max-width —
    // fixed side margins below `xl`, switching to auto-centering once max-w-6xl actually binds.
    <header
      className={`sticky top-6 z-40 mx-4 mb-6 mt-6 flex max-w-6xl items-center justify-between rounded-[20px] bg-white/75 px-4 py-3 backdrop-blur-md transition-shadow duration-300 ease-out-expo dark:bg-gray-950/75 sm:mx-6 sm:px-6 xl:mx-auto ${
        scrolled
          ? 'shadow-nav-scrolled dark:shadow-nav-scrolled-dark'
          : 'shadow-nav dark:shadow-nav-dark'
      }`}
    >
      <Link
        href="/"
        aria-label={siteMetadata.headerTitle}
        className="group flex items-center gap-2"
      >
        <span className="inline-block h-7 w-7 origin-center transition-transform duration-300 ease-out-expo [&>svg]:h-full [&>svg]:w-full group-hover:-rotate-3 group-hover:scale-105 group-active:scale-95">
          <Logo />
        </span>
        {typeof siteMetadata.headerTitle === 'string' ? (
          <span className="hidden whitespace-nowrap text-base font-bold tracking-tight text-ink dark:text-gray-100 xl:block">
            {siteMetadata.headerTitle}
          </span>
        ) : (
          siteMetadata.headerTitle
        )}
      </Link>

      <div className="flex items-center gap-5">
        {headerNavLinks
          .filter((link) => link.href !== '/')
          .map((link) => {
            const active = pathname?.startsWith(link.match)
            return (
              <Link
                key={link.title}
                href={link.href}
                className={`relative hidden whitespace-nowrap py-1.5 text-sm font-medium transition-colors duration-150 ease-out-expo after:absolute after:-bottom-[7px] after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:transition-colors after:duration-200 after:ease-out-expo xl:block ${
                  active
                    ? 'text-ink after:bg-accent-500 dark:text-gray-100 dark:after:bg-accent-400'
                    : 'text-gray-600 after:bg-transparent hover:text-ink dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                {link.title}
              </Link>
            )
          })}
        <AuthNav />
        <SearchButton />
        <ThemeSwitch />
        <MobileNav />
      </div>
    </header>
  )
}

export default Header
