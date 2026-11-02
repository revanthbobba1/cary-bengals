import Link from 'next/link'
import type { Member } from '@/data/members'
import SocialIcon from '@/components/social-icons'
import Image from '@/components/Image'
import RosterModal from '@/components/RosterModal'
import TeamLogo from '@/components/TeamLogo'
import { getBlurProps } from '@/lib/blurPlaceholders'
import type { RosterPlayer } from '@/lib/types/roster'

interface Props {
  content: Member
  team?: string
  // Null for a team with no logo set in ESPN (not every owner picks one); undefined when there's
  // no team match at all, same as `team` itself.
  teamLogo?: string | null
  roster?: RosterPlayer[]
  // Seasons won / lost in the final, from the league history; omitted when unknown.
  titles?: number[]
  runnerUps?: number[]
}

export default function MemberLayout({
  content,
  team,
  teamLogo,
  roster,
  titles = [],
  runnerUps = [],
}: Props) {
  const { name, avatar, email, twitter, linkedin, github } = content

  return (
    <div className="flex h-full w-full min-h-[420px] flex-col items-center rounded-card border border-gray-200 bg-white p-8 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      {avatar && (
        <Image
          src={avatar}
          alt={name}
          width={208}
          height={208}
          className="h-52 w-52 rounded-full object-cover"
          {...getBlurProps(avatar)}
        />
      )}
      <h3 className="pb-1.5 pt-5 text-center text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
        {name}
      </h3>
      <div className="flex items-center justify-center gap-1.5 text-center text-base text-gray-500 dark:text-gray-400">
        <TeamLogo src={teamLogo ?? null} />
        {team ?? `Team ${name.split(' ')[0]}`}
      </div>
      {(titles.length > 0 || runnerUps.length > 0) && (
        <Link
          href={`/history/owner/${content.slug}`}
          className="pt-2 text-center text-sm text-gray-600 hover:underline dark:text-gray-400"
        >
          {[
            titles.length > 0 && `🏆 ${titles.join(', ')}`,
            runnerUps.length > 0 && `🥈 ${runnerUps.join(', ')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Link>
      )}
      {roster && roster.length > 0 && (
        <RosterModal teamName={team ?? `Team ${name.split(' ')[0]}`} players={roster} />
      )}
      <div className="flex min-h-9 items-center gap-2 pt-5">
        <SocialIcon kind="mail" href={`mailto:${email}`} size={6} />
        <SocialIcon kind="github" href={github} size={6} />
        <SocialIcon kind="linkedin" href={linkedin} size={6} />
        <SocialIcon kind="twitter" href={twitter} size={6} />
      </div>
    </div>
  )
}
