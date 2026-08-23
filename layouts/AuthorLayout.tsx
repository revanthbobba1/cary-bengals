import { ReactNode } from 'react'
import type { Authors } from 'contentlayer/generated'
import SocialIcon from '@/components/social-icons'
import Image from '@/components/Image'

interface Props {
  children: ReactNode
  content: Omit<Authors, '_id' | '_raw' | 'body'>
}

export default function AuthorLayout({ children, content }: Props) {
  const { name, avatar, team, company, email, twitter, linkedin, github } = content

  return (
    <div className="flex w-full flex-col items-center rounded-card border border-gray-200 bg-white p-8 shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark">
      {avatar && (
        <Image
          src={avatar}
          alt="avatar"
          width={160}
          height={160}
          className="h-40 w-40 rounded-full"
        />
      )}
      <h3 className="pb-1 pt-4 text-xl font-bold tracking-tight text-ink dark:text-gray-100">
        {name}
      </h3>
      <div className="text-sm text-gray-500 dark:text-gray-400">{team}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{company}</div>
      <div className="flex items-center gap-1 pt-4">
        <SocialIcon kind="mail" href={`mailto:${email}`} size={5} />
        <SocialIcon kind="github" href={github} size={5} />
        <SocialIcon kind="linkedin" href={linkedin} size={5} />
        <SocialIcon kind="twitter" href={twitter} size={5} />
      </div>
      <div className="prose w-full pt-6 text-center text-sm dark:prose-invert">{children}</div>
    </div>
  )
}
