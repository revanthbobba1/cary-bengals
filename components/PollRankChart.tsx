'use client'

import { useEffect, useState } from 'react'
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

// Base geometry; everything is multiplied by `scale` so the fullscreen view is just a bigger chart.
const ROW_H = 44
const COL_W = 76
const PAD = { top: 28, right: 100, bottom: 60, left: 68 }
const AVATAR_R = 16
const DOT_R = 6

interface Point {
  week: number
  rank: number
  team: string
  // Nudges so owners tied at the same rank don't sit on top of each other: avatars spread
  // sideways (rows are too tight to stack them), plain dots spread vertically. labelDx/labelDy
  // place the name beside the avatar group.
  dx: number
  dy: number
  labelDx: number
  labelDy: number
}

interface Series {
  key: string
  owner: string
  color: string
  avatar?: string
  points: Point[]
}

interface ChartBodyProps {
  series: Series[]
  weeks: number[]
  maxRank: number
  year: number
  scale: number
  active: string | null
  setActive: (key: string | null) => void
}

function ChartBody({ series, weeks, maxRank, year, scale, active, setActive }: ChartBodyProps) {
  const rowH = ROW_H * scale
  const colW = COL_W * scale
  const pad = {
    top: PAD.top * scale,
    right: PAD.right * scale,
    bottom: PAD.bottom * scale,
    left: PAD.left * scale,
  }
  const avatarR = AVATAR_R * scale
  const dotR = DOT_R * scale

  const width = pad.left + pad.right + Math.max(weeks.length - 1, 1) * colW
  const height = pad.top + pad.bottom + (maxRank - 1) * rowH
  const x = (week: number) => pad.left + weeks.indexOf(week) * colW
  const y = (rank: number) => pad.top + (rank - 1) * rowH

  // Draw the focused series last so it sits on top of the others.
  const ordered = active
    ? [...series.filter((s) => s.key !== active), ...series.filter((s) => s.key === active)]
    : series

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ minWidth: width, maxWidth: width }}
      className="mx-auto"
      role="img"
      aria-label={`Power ranking by week for ${year}`}
      onMouseLeave={() => setActive(null)}
    >
      <defs>
        <clipPath id="avatar-clip" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
      {/* Background so a tap on empty space clears the focused owner on touch screens. */}
      <rect width={width} height={height} fill="transparent" onClick={() => setActive(null)} />

      {Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => (
        <g key={rank} className="text-gray-400 dark:text-gray-600">
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(rank)}
            y2={y(rank)}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.45}
          />
          <text
            x={pad.left - 14 * scale}
            y={y(rank)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={16 * scale}
            fontWeight={700}
            className="fill-gray-800 dark:fill-gray-100"
          >
            {rank}
          </text>
        </g>
      ))}
      {/* Axis lines */}
      <g className="text-gray-500 dark:text-gray-400" stroke="currentColor" strokeWidth={2}>
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top - 12 * scale}
          y2={height - pad.bottom + 12 * scale}
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom + 12 * scale}
          y2={height - pad.bottom + 12 * scale}
        />
      </g>
      {weeks.map((week) => (
        <text
          key={week}
          x={x(week)}
          y={height - pad.bottom + 34 * scale}
          textAnchor="middle"
          fontSize={16 * scale}
          fontWeight={700}
          className="fill-gray-800 dark:fill-gray-100"
        >
          Wk {week}
        </text>
      ))}
      <text
        transform={`translate(${14 * scale},${(pad.top + height - pad.bottom) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize={14 * scale}
        fontWeight={600}
        letterSpacing={1}
        className="fill-gray-500 dark:fill-gray-400"
      >
        RANK
      </text>
      <text
        x={(pad.left + width - pad.right) / 2}
        y={height - 6 * scale}
        textAnchor="middle"
        fontSize={14 * scale}
        fontWeight={600}
        letterSpacing={1}
        className="fill-gray-500 dark:fill-gray-400"
      >
        WEEK
      </text>

      {ordered.map((s) => {
        const dimmed = active !== null && active !== s.key
        const isActive = active === s.key
        const path = s.points
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'}${x(p.week) + p.dx * scale},${y(p.rank) + p.dy * scale}`
          )
          .join(' ')
        const last = s.points[s.points.length - 1]
        return (
          <g
            key={s.key}
            tabIndex={0}
            role="group"
            aria-label={`${s.owner}: ${s.points.map((p) => `week ${p.week} rank ${p.rank}`).join(', ')}`}
            onMouseEnter={() => setActive(s.key)}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(isActive ? null : s.key)}
            style={{
              opacity: dimmed ? 0.12 : 1,
              transition: 'opacity 150ms ease-out',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {/* Wide transparent stroke so thin lines are easy to hover. */}
            <path d={path} fill="none" stroke="transparent" strokeWidth={16 * scale} />
            <path
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={(isActive ? 5 : 3) * scale}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p) => {
              const isLast = p === last
              return (
                <g
                  key={p.week}
                  transform={`translate(${x(p.week) + p.dx * scale},${y(p.rank) + p.dy * scale})`}
                >
                  <title>{`${s.owner} (${p.team}) — Week ${p.week}: #${p.rank}`}</title>
                  {isLast ? (
                    <>
                      <circle r={avatarR + 2 * scale} fill={s.color} />
                      {s.avatar ? (
                        <image
                          href={s.avatar}
                          x={-avatarR}
                          y={-avatarR}
                          width={avatarR * 2}
                          height={avatarR * 2}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="url(#avatar-clip)"
                        />
                      ) : (
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={14 * scale}
                          fontWeight={700}
                          fill="#fff"
                        >
                          {s.owner.charAt(0).toUpperCase()}
                        </text>
                      )}
                    </>
                  ) : (
                    <circle r={dotR} fill={s.color} stroke="#fff" strokeWidth={1.5 * scale} />
                  )}
                </g>
              )
            })}
            {/* Name at the line's last point so each line is identifiable without hovering. */}
            <text
              x={x(last.week) + (last.labelDx + AVATAR_R + 10) * scale}
              y={y(last.rank) + last.labelDy * scale}
              dominantBaseline="middle"
              fontSize={14 * scale}
              fontWeight={700}
              fill={s.color}
            >
              {s.owner.split(' ')[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function PollRankChart({ history, year, avatarByOwner }: Props) {
  const [active, setActive] = useState<string | null>(null)
  // Fullscreen scale; null means the inline chart is showing.
  const [fullScale, setFullScale] = useState<number | null>(null)

  useEffect(() => {
    if (fullScale === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScale(null)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [fullScale])

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
    s.points.push({
      week: r.week_number,
      rank: r.final_rank,
      team: r.team_name,
      dx: 0,
      dy: 0,
      labelDx: 0,
      labelDy: 0,
    })
  }
  const series = [...byOwner.values()].sort((a, b) => a.owner.localeCompare(b.owner))
  series.forEach((s, i) => {
    s.color = PALETTE[i % PALETTE.length]
    s.points.sort((a, b) => a.week - b.week)
  })

  // Owners tied at a rank in the same week share a row. Avatars (each owner's last point) fan out
  // sideways with their names stacked to the right; plain dots fan out vertically.
  const tieGroups = new Map<string, { point: Point; hasAvatar: boolean }[]>()
  for (const s of series) {
    s.points.forEach((p, i) => {
      const groupKey = `${p.week}:${p.rank}`
      const group = tieGroups.get(groupKey) ?? []
      group.push({ point: p, hasAvatar: i === s.points.length - 1 })
      tieGroups.set(groupKey, group)
    })
  }
  for (const group of tieGroups.values()) {
    const avatars = group.filter((g) => g.hasAvatar)
    const dots = group.filter((g) => !g.hasAvatar)
    const avatarStep = AVATAR_R * 2 + 4
    avatars.forEach((g, i) => {
      g.point.dx = (i - (avatars.length - 1) / 2) * avatarStep
      g.point.labelDx = ((avatars.length - 1) / 2) * avatarStep
      g.point.labelDy = (i - (avatars.length - 1) / 2) * 18
    })
    dots.forEach((g, i) => {
      g.point.dy = (i - (dots.length - 1) / 2) * DOT_R * 3
    })
  }

  const maxRank = Math.max(...rows.map((r) => r.final_rank))
  const bodyProps = { series, weeks, maxRank, year, active, setActive }

  // Scale the chart up to fill the screen, but never below a readable size: on a phone it ends up
  // wider than the screen and scrolls sideways instead of shrinking.
  const openFullscreen = () => {
    const naturalWidth = PAD.left + PAD.right + Math.max(weeks.length - 1, 1) * COL_W
    const fit = (window.innerWidth - 32) / naturalWidth
    setFullScale(Math.min(2.2, Math.max(1.3, fit)))
  }

  const legend = (
    <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
      {series.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(active === s.key ? null : s.key)}
            className="flex items-center gap-1.5 text-gray-700 transition-opacity dark:text-gray-300"
            style={{ opacity: active !== null && active !== s.key ? 0.4 : 1 }}
          >
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
            {s.owner.split(' ')[0]}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={openFullscreen}
          className="rounded-control border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ⛶ Full screen
        </button>
      </div>
      <div className="overflow-x-auto">
        <ChartBody {...bodyProps} scale={1} />
      </div>
      {legend}

      {fullScale !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Power ranking chart for ${year}`}
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h3 className="text-lg font-bold text-ink dark:text-gray-100">
              Power Rankings · {year}
            </h3>
            <button
              type="button"
              onClick={() => setFullScale(null)}
              className="rounded-control border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              ✕ Close
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <ChartBody {...bodyProps} scale={fullScale} />
            {legend}
          </div>
        </div>
      )}
    </div>
  )
}
