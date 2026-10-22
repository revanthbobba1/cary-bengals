'use client'

import { useState } from 'react'
import { normalizeOwnerKey, type PollHistoryRow } from '@/lib/pollChart'

interface Props {
  history: PollHistoryRow[]
  year: number
  // Keyed by normalizeOwnerKey(owner first name); values are author avatar paths.
  avatarByOwner: Record<string, string>
}

// 12 categorical hues, mid-lightness so they stay legible on both the white and dark card.
const PALETTE = [
  '#e6550d',
  '#3182bd',
  '#31a354',
  '#756bb1',
  '#d6a000',
  '#e7298a',
  '#17a2b8',
  '#8c6d31',
  '#636363',
  '#bc4b51',
  '#5b8e7d',
  '#9467bd',
]

const ROW_H = 40
const COL_W = 72
const PAD = { top: 24, right: 88, bottom: 36, left: 48 }
const AVATAR_R = 15

interface Series {
  key: string
  owner: string
  color: string
  avatar?: string
  points: { week: number; rank: number; team: string }[]
}

export default function PollRankChart({ history, year, avatarByOwner }: Props) {
  const [active, setActive] = useState<string | null>(null)

  const rows = history.filter((r) => r.season_year === year)
  const weeks = [...new Set(rows.map((r) => r.week_number))].sort((a, b) => a - b)

  if (weeks.length === 0) {
    return <div className="py-8 text-center">No poll history for {year} yet</div>
  }

  const byOwner = new Map<string, Series>()
  for (const r of rows) {
    const key = normalizeOwnerKey(r.owner_name) || r.team_name
    let s = byOwner.get(key)
    if (!s) {
      s = {
        key,
        owner: r.owner_name || r.team_name,
        color: '',
        avatar: avatarByOwner[key],
        points: [],
      }
      byOwner.set(key, s)
    }
    s.points.push({ week: r.week_number, rank: r.final_rank, team: r.team_name })
  }
  const series = [...byOwner.values()].sort((a, b) => a.owner.localeCompare(b.owner))
  series.forEach((s, i) => {
    s.color = PALETTE[i % PALETTE.length]
    s.points.sort((a, b) => a.week - b.week)
  })

  const maxRank = Math.max(...rows.map((r) => r.final_rank))
  const width = PAD.left + PAD.right + Math.max(weeks.length - 1, 1) * COL_W
  const height = PAD.top + PAD.bottom + (maxRank - 1) * ROW_H
  const x = (week: number) => PAD.left + weeks.indexOf(week) * COL_W
  const y = (rank: number) => PAD.top + (rank - 1) * ROW_H

  // Draw the focused series last so it sits on top of the others.
  const ordered = active
    ? [...series.filter((s) => s.key !== active), ...series.filter((s) => s.key === active)]
    : series

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width, maxWidth: width, maxHeight: 640 }}
        className="mx-auto w-full"
        role="img"
        aria-label={`Power ranking by week for ${year}`}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          {series.map((s) => (
            <clipPath key={s.key} id={`avatar-clip-${s.key}`} clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          ))}
        </defs>

        {Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => (
          <g key={rank} className="text-gray-400 dark:text-gray-600">
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(rank)}
              y2={y(rank)}
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.5}
            />
            <text
              x={PAD.left - 16}
              y={y(rank)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              fill="currentColor"
            >
              {rank}
            </text>
          </g>
        ))}
        {weeks.map((week) => (
          <text
            key={week}
            x={x(week)}
            y={height - 12}
            textAnchor="middle"
            fontSize={12}
            className="fill-gray-500 dark:fill-gray-400"
          >
            Wk {week}
          </text>
        ))}

        {ordered.map((s) => {
          const dimmed = active !== null && active !== s.key
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.week)},${y(p.rank)}`)
            .join(' ')
          return (
            <g
              key={s.key}
              tabIndex={0}
              role="group"
              aria-label={`${s.owner}: ${s.points.map((p) => `week ${p.week} rank ${p.rank}`).join(', ')}`}
              onMouseEnter={() => setActive(s.key)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
              style={{
                opacity: dimmed ? 0.12 : 1,
                transition: 'opacity 150ms ease-out',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {/* Wide transparent stroke so thin lines are easy to hover. */}
              <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.key ? 5 : 3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => (
                <g key={p.week} transform={`translate(${x(p.week)},${y(p.rank)})`}>
                  <title>{`${s.owner} (${p.team}) — Week ${p.week}: #${p.rank}`}</title>
                  <circle r={AVATAR_R + 2} fill={s.color} />
                  {s.avatar ? (
                    <image
                      href={s.avatar}
                      x={-AVATAR_R}
                      y={-AVATAR_R}
                      width={AVATAR_R * 2}
                      height={AVATAR_R * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#avatar-clip-${s.key})`}
                    />
                  ) : (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={13}
                      fontWeight={700}
                      fill="#fff"
                    >
                      {s.owner.charAt(0).toUpperCase()}
                    </text>
                  )}
                </g>
              ))}
              {/* Name at the line's last point so each line is identifiable without hovering. */}
              <text
                x={x(s.points[s.points.length - 1].week) + AVATAR_R + 8}
                y={y(s.points[s.points.length - 1].rank)}
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={600}
                fill={s.color}
              >
                {s.owner.split(' ')[0]}
              </text>
            </g>
          )
        })}
      </svg>

      <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
        {series.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            className="flex cursor-pointer items-center gap-1.5 text-gray-700 transition-opacity dark:text-gray-300"
            style={{ opacity: active !== null && active !== s.key ? 0.4 : 1 }}
          >
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
            {s.owner.split(' ')[0]}
          </li>
        ))}
      </ul>
    </div>
  )
}
