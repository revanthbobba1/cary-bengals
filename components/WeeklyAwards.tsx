import TeamLogo from '@/components/TeamLogo'
import type { Award } from '@/lib/awards/weeklyAwards'

interface Props {
  awards: Award[]
  // Keyed by team id; omitted by callers that have no logo data handy.
  teamLogoById?: Record<string, string | null>
  // Two columns on wide screens; the home page's narrower card keeps a single column.
  compact?: boolean
}

export default function WeeklyAwards({ awards, teamLogoById, compact = false }: Props) {
  if (awards.length === 0) return null
  return (
    <ul
      className={`grid grid-cols-1 gap-x-8 gap-y-3 ${compact ? '' : 'md:grid-cols-2'}`}
      aria-label="Weekly awards"
    >
      {awards.map((award) => (
        <li key={award.id} className="flex items-start gap-3">
          <span className="text-xl leading-6" aria-hidden="true">
            {award.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {award.title}
            </p>
            <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-gray-100">
              {teamLogoById && <TeamLogo src={teamLogoById[award.teamId] ?? null} />}
              <span className="truncate">{award.teamName}</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{award.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
