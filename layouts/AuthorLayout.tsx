import { ReactNode } from 'react'
import type { Authors } from 'contentlayer/generated'
import SocialIcon from '@/components/social-icons'
import Image from '@/components/Image'
import { blurPlaceholders } from '@/lib/blurPlaceholders'

interface Props {
  children: ReactNode
  content: Omit<Authors, '_id' | '_raw' | 'body'>
}

export default function AuthorLayout({ children, content }: Props) {
  const { name, avatar, team, company, email, twitter, linkedin, github } = content

  return (
    <div className="flex h-full w-full min-h-[420px] flex-col items-center rounded-card border border-gray-200 bg-white p-8 shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark">
      {avatar && (
        <Image
          src={avatar}
          alt={name}
          width={208}
          height={208}
          className="h-52 w-52 rounded-full object-cover"
          placeholder={blurPlaceholders[avatar] ? 'blur' : 'empty'}
          blurDataURL={blurPlaceholders[avatar]}
        />
      )}
      <h3 className="pb-1.5 pt-5 text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
        {name}
      </h3>
      <div className="text-base text-gray-500 dark:text-gray-400">{team}</div>
      <div className="text-base text-gray-500 dark:text-gray-400">{company}</div>
      <div className="flex min-h-9 items-center gap-2 pt-5">
        <SocialIcon kind="mail" href={`mailto:${email}`} size={6} />
        <SocialIcon kind="github" href={github} size={6} />
        <SocialIcon kind="linkedin" href={linkedin} size={6} />
        <SocialIcon kind="twitter" href={twitter} size={6} />
      </div>
      <div className="prose w-full pt-6 text-center dark:prose-invert">{children}</div>
    </div>
  )
}
