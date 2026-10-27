'use client'

import { useMemo, useState } from 'react'
import { focusRingClasses } from '@/lib/focusRing'
import MatchupBoxScore from '@/components/MatchupBoxScore'
import TeamLogo from '@/components/TeamLogo'
import { useChangeFlash } from '@/lib/hooks/useChangeFlash'
import type { Matchup } from '@/lib/types/matchup'

interface Props {
  matchups: Matchup[]
  // A plain object, not a Map -- /schedule's week browser is a Client Component, and a Map
  // doesn't survive serialization across the Server-to-Client boundary.
  teamNameById: Record<string, string>
  // Null for a team with no logo set in ESPN -- not every owner picks one.
  teamLogoById: Record<string, string | null>
  // Default false: /admin/poll's "last week's matchups" preview is a quick glance while ranking,
  // not a play-by-play view, so it renders plain rows. Only /schedule opts in.
  allowExpand?: boolean
}

// Rendered by /schedule (one week at a time, via ScheduleWeekBrowser) and /admin/poll's "last
// week's matchups" preview -- same row shape in both places; the parent decides which matchups to
// pass in.
export default function MatchupList({
  matchups,
  teamNameById,
  teamLogoById,
  allowExpand = false,
}: Props) {
  const [expandedMatchupId, setExpandedMatchupId] = useState<string | null>(null)

  // Keyed on both scores together (not summed, so an equal-and-opposite change on each side still
  // registers) -- lets a live-poll refresh (see ScheduleWeekBrowser) briefly highlight exactly
  // which matchups' scores actually moved, not just that "something" on the page changed.
  const scoreValues = useMemo(() => {
    const values: Record<string, string> = {}
    for (const matchup of matchups) {
      values[matchup.id] = `${matchup.home_score}|${matchup.away_score ?? ''}`
    }
    return values
  }, [matchups])
  const flashingMatchupIds = useChangeFlash(scoreValues)

  if (matchups.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">No matchups yet.</p>
  }

  return (
    <ul className="space-y-3">
      {matchups.map((matchup) => {
        const homeName = teamNameById[matchup.home_team_id] ?? 'Unknown team'
        const awayName = matchup.away_team_id
          ? (teamNameById[matchup.away_team_id] ?? 'Unknown team')
          : null
        const homeWon = matchup.winner === 'HOME'
        const awayWon = matchup.winner === 'AWAY'
        const isExpanded = allowExpand && expandedMatchupId === matchup.id
        const boxScorePanelId = `matchup-${matchup.id}-boxscore`
        const isScoreFlashing = flashingMatchupIds.has(matchup.id)

        // Projected score/win probability are only ever non-null for the current matchup period
        // (see lib/types/matchup.ts) -- so this subline naturally disappears once a week is
        // final and never appears for a future week, with no "is this the current week" check
        // needed here. `!= null` (not `!==`) also tolerates a row read before migration 044 is
        // applied, where these columns are absent (`undefined`) rather than `null`. Both sides
        // are checked, not just home -- nothing in the ESPN schema guarantees they're always
        // both-or-neither populated.
        const hasProjection =
          matchup.home_projected_score != null && matchup.away_projected_score != null

        const rowContent = (
          <div className="flex items-center justify-between gap-4">
            {/* flex-1 on both name blocks (not just min-w-0) keeps them equal width regardless
                of how long each team's name is, so the score block in between sits at the row's
                true midpoint instead of drifting toward whichever side has the shorter name. */}
            <div className="min-w-0 flex-1">
              <p
                className={`flex items-center gap-1.5 truncate text-base ${homeWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                <TeamLogo src={teamLogoById[matchup.home_team_id] ?? null} />
                <span className="truncate">{homeName}</span>
              </p>
              {matchup.home_win_probability != null && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {Math.round(matchup.home_win_probability * 100)}% win
                </p>
              )}
            </div>
            <div
              className={`shrink-0 rounded-md px-2 py-1 text-center transition-colors duration-1000 ${isScoreFlashing ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}`}
            >
              <p className="font-mono text-base tabular-nums text-ink dark:text-gray-100">
                {matchup.is_bye || matchup.away_score === null
                  ? matchup.home_score.toFixed(2)
                  : `${matchup.home_score.toFixed(2)} – ${matchup.away_score.toFixed(2)}`}
              </p>
              {hasProjection && (
                <p className="font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">
                  {/* Non-null: hasProjection already confirmed both sides are non-null above. */}
                  Proj {matchup.home_projected_score!.toFixed(1)} –{' '}
                  {matchup.away_projected_score!.toFixed(1)}
                </p>
              )}
            </div>
            <div className="min-w-0 flex-1 text-right">
              {/* An explicit label, not the 'Unknown team' fallback -- that's indistinguishable
                  from a real data error. */}
              <p
                className={`flex items-center justify-end gap-1.5 truncate text-base ${awayWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                <span className="truncate">{matchup.is_bye ? 'BYE' : awayName}</span>
                {!matchup.is_bye && (
                  <TeamLogo
                    src={matchup.away_team_id ? (teamLogoById[matchup.away_team_id] ?? null) : null}
                  />
                )}
              </p>
              {matchup.away_win_probability != null && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {Math.round(matchup.away_win_probability * 100)}% win
                </p>
              )}
            </div>
          </div>
        )

        return (
          <li
            key={matchup.id}
            className="rounded-card border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
          >
            {allowExpand ? (
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={boxScorePanelId}
                onClick={() => setExpandedMatchupId(isExpanded ? null : matchup.id)}
                className={`w-full px-6 py-6 text-left ${focusRingClasses}`}
              >
                {rowContent}
              </button>
            ) : (
              <div className="px-6 py-6">{rowContent}</div>
            )}
            {matchup.winner === 'TIE' && (
              <p className="pb-2 text-center text-xs text-gray-500 dark:text-gray-400">Tie</p>
            )}
            {isExpanded && (
              <div
                id={boxScorePanelId}
                role="region"
                aria-label={
                  matchup.is_bye ? `${homeName} box score` : `${homeName} vs ${awayName} box score`
                }
                className="border-t border-gray-200 px-6 py-4 dark:border-gray-800"
              >
                <MatchupBoxScore
                  homeName={homeName}
                  awayName={awayName ?? ''}
                  isBye={matchup.is_bye}
                  home={matchup.home_player_scores}
                  away={matchup.away_player_scores}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
