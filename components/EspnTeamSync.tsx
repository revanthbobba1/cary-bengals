'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import {
  previewEspnTeamSyncAction,
  commitEspnTeamSyncAction,
  type TeamSyncPreview,
} from 'app/admin/poll/manage/teams-sync-actions'

interface Props {
  seasonYear: number
}

interface RowState {
  dbTeamId: string
  dbTeamName: string
  dbOwnerName: string
  selectedEspnTeamId: number | ''
  acceptOwnerName: boolean
}

const inputClasses =
  'rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark'

const primaryButtonClasses = `rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50`

export default function EspnTeamSync({ seasonYear }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [preview, setPreview] = useState<TeamSyncPreview | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    const result = await previewEspnTeamSyncAction(seasonYear)
    setLoading(false)

    if (result.data === null) {
      setError(result.error)
      return
    }

    setPreview(result.data)
    setRows(
      result.data.rows.map((row) => ({
        dbTeamId: row.dbTeam.id,
        dbTeamName: row.dbTeam.name,
        dbOwnerName: row.dbTeam.owner_name,
        selectedEspnTeamId: row.suggestedEspnTeamId ?? '',
        acceptOwnerName: false,
      }))
    )
  }

  const usedEspnIds = new Set(
    rows.map((row) => row.selectedEspnTeamId).filter((id): id is number => id !== '')
  )

  const handleSelect = (dbTeamId: string, espnTeamId: number | '') => {
    setRows((prev) =>
      prev.map((row) =>
        row.dbTeamId === dbTeamId ? { ...row, selectedEspnTeamId: espnTeamId } : row
      )
    )
  }

  const handleToggleAccept = (dbTeamId: string, value: boolean) => {
    setRows((prev) =>
      prev.map((row) => (row.dbTeamId === dbTeamId ? { ...row, acceptOwnerName: value } : row))
    )
  }

  const handleCommit = async () => {
    const pairings = rows
      .filter((row) => row.selectedEspnTeamId !== '')
      .map((row) => ({
        dbTeamId: row.dbTeamId,
        espnTeamId: row.selectedEspnTeamId as number,
        acceptOwnerName: row.acceptOwnerName,
      }))

    if (pairings.length === 0) {
      toast.error('Pair at least one team before applying.')
      return
    }

    setCommitting(true)
    const result = await commitEspnTeamSyncAction(seasonYear, pairings)
    setCommitting(false)

    if (result.data === null) {
      toast.error(result.error)
      return
    }

    toast.success(
      `Synced ${result.data.updatedCount} team${result.data.updatedCount === 1 ? '' : 's'}.`
    )
    setPreview(null)
    setRows([])
    router.refresh()
  }

  const espnTeamsById = new Map((preview?.espnTeams ?? []).map((team) => [team.espn_team_id, team]))

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Sync Teams from ESPN</h2>
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading}
          className={primaryButtonClasses}
        >
          {loading ? 'Checking ESPN...' : preview ? 'Refresh from ESPN' : 'Check ESPN for updates'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {preview && preview.warnings.length > 0 && (
        <div className="mb-4 rounded-control bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          {preview.warnings.join(' ')}
        </div>
      )}

      {preview && (
        <>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Pair each team with its ESPN team. Team names always take ESPN's current value; owner
            names only change if you check &ldquo;use ESPN&apos;s name&rdquo; — ESPN&apos;s display
            name is often a generated username rather than a real name.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="p-2 text-left">Current team</th>
                  <th className="p-2 text-left">Owner</th>
                  <th className="p-2 text-left">ESPN team</th>
                  <th className="p-2 text-left">ESPN owner</th>
                  <th className="p-2 text-left">Use ESPN name?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selectedEspnTeam =
                    row.selectedEspnTeamId !== ''
                      ? espnTeamsById.get(row.selectedEspnTeamId)
                      : undefined

                  return (
                    <tr
                      key={row.dbTeamId}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="p-2">{row.dbTeamName}</td>
                      <td className="p-2">{row.dbOwnerName}</td>
                      <td className="p-2">
                        <select
                          value={row.selectedEspnTeamId}
                          onChange={(e) =>
                            handleSelect(
                              row.dbTeamId,
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          className={inputClasses}
                        >
                          <option value="">— not paired —</option>
                          {(preview.espnTeams ?? [])
                            .filter(
                              (team) =>
                                team.espn_team_id === row.selectedEspnTeamId ||
                                !usedEspnIds.has(team.espn_team_id)
                            )
                            .map((team) => (
                              <option key={team.espn_team_id} value={team.espn_team_id}>
                                {team.name} ({team.record.wins}-{team.record.losses}
                                {team.record.ties ? `-${team.record.ties}` : ''})
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="p-2">{selectedEspnTeam?.owner_display_name ?? '—'}</td>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={row.acceptOwnerName}
                          disabled={!selectedEspnTeam?.owner_display_name}
                          onChange={(e) => handleToggleAccept(row.dbTeamId, e.target.checked)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleCommit}
            disabled={committing}
            className={`mt-4 ${primaryButtonClasses}`}
          >
            {committing ? 'Applying...' : 'Apply Sync'}
          </button>
        </>
      )}
    </div>
  )
}
