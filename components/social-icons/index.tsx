import { Mail, Github, Facebook, Youtube, Linkedin, Twitter, Mastodon } from './icons'

const components = {
  mail: Mail,
  github: Github,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  twitter: Twitter,
  mastodon: Mastodon,
}

// Tailwind's JIT scanner needs full class-name literals, not interpolated `h-${size}` strings.
const sizeClasses: Record<number, string> = {
  5: 'h-5 w-5',
  6: 'h-6 w-6',
  8: 'h-8 w-8',
}

type SocialIconProps = {
  kind: keyof typeof components
  href: string | undefined
  size?: number
}

const SocialIcon = ({ kind, href, size = 8 }: SocialIconProps) => {
  if (!href || (kind === 'mail' && !/^mailto:\w+([.-]?\w+)@\w+([.-]?\w+)(.\w{2,3})+$/.test(href)))
    return null

  const SocialSvg = components[kind]

  return (
    <a
      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-gray-100 hover:text-accent-500 hover:shadow-[0_8px_16px_-4px_rgba(79,70,229,0.15)] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-accent-400 dark:hover:shadow-[0_8px_16px_-4px_rgba(129,140,248,0.2)]"
      target="_blank"
      rel="noopener noreferrer"
      href={href}
    >
      <span className="sr-only">{kind}</span>
      <SocialSvg className={`fill-current ${sizeClasses[size] ?? sizeClasses[8]}`} />
    </a>
  )
}

export default SocialIcon
