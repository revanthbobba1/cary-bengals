'use client'

import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Logo from '@/data/logo.svg'
import SocialIcon from '@/components/social-icons'
import { useAuth } from '@/lib/hooks/useAuth'

const footLinkClasses =
  'group inline-flex w-fit items-center rounded text-sm font-medium text-gray-700 transition-colors duration-150 ease-out-expo hover:text-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 dark:text-gray-300 dark:hover:text-accent-400'

function FootLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick?: () => void
  children: string
}) {
  return (
    <Link href={href} onClick={onClick} className={footLinkClasses}>
      {children}
      <span className="ml-0 inline-block w-0 overflow-hidden opacity-0 transition-all duration-200 ease-out-expo group-hover:ml-1 group-hover:w-3 group-hover:opacity-100">
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
    </Link>
  )
}

export default function Footer() {
  const { isLoggedIn, logout } = useAuth()

  return (
    <footer className="pb-10 pt-14">
      <div className="grid grid-cols-1 gap-10 pb-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-7 w-7 opacity-85 [&>svg]:h-full [&>svg]:w-full">
              <Logo />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink dark:text-gray-100">
              {siteMetadata.headerTitle}
            </span>
          </div>
          <p className="max-w-[30ch] text-sm leading-[21px] text-gray-500 dark:text-gray-400">
            {siteMetadata.description}
          </p>
          <div className="mt-1 flex items-center gap-2.5">
            <SocialIcon kind="mail" href={`mailto:${siteMetadata.email}`} size={5} />
            <SocialIcon kind="github" href={siteMetadata.github} size={5} />
            <SocialIcon kind="facebook" href={siteMetadata.facebook} size={5} />
            <SocialIcon kind="youtube" href={siteMetadata.youtube} size={5} />
            <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={5} />
            <SocialIcon kind="twitter" href={siteMetadata.twitter} size={5} />
          </div>
        </div>

        <div className="flex flex-col gap-[11px]">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            League
          </p>
          {headerNavLinks
            .filter((link) => link.href !== '/')
            .map((link) => (
              <FootLink key={link.title} href={link.href}>
                {link.title}
              </FootLink>
            ))}
        </div>

        <div className="flex flex-col gap-[11px]">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Account
          </p>
          {isLoggedIn ? (
            <>
              <FootLink href="/admin">Admin</FootLink>
              <button onClick={logout} className={footLinkClasses}>
                Logout
              </button>
            </>
          ) : (
            <FootLink href="/login">Login</FootLink>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6 dark:border-gray-800">
        <div className="text-[13px] text-gray-400 dark:text-gray-500">
          © {new Date().getFullYear()} {siteMetadata.author} — {siteMetadata.title}
        </div>
      </div>
    </footer>
  )
}
