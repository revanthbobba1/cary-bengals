import { formatDeadline } from '@/lib/formatDeadline'
import { focusRingClasses } from '@/lib/focusRing'
import type { PollWeek } from '@/lib/types/poll'

interface Props {
  week: PollWeek
  // Whether the week is still open (unlocked, deadline in the future). Computed by the parent so
  // it uses the same server-supplied "now" as the rest of PollWeekManager.
  isOpen: boolean
  editing: boolean
  hoursDraft: string
  onHoursDraftChange: (value: string) => void
  onToggle: () => void
  onStartEditing: () => void
  onSaveHours: () => void
  onCancelEditing: () => void
}

// One always-visible line per poll week describing its reminder email (docs/POLL_REMINDERS_PLAN.md).
// Only open weeks are editable; a week that already sent says so; closed weeks show nothing, so old
// history rows aren't cluttered with "Reminder: off".
export default function PollWeekReminderStatus({
  week,
  isOpen,
  editing,
  hoursDraft,
  onHoursDraftChange,
  onToggle,
  onStartEditing,
  onSaveHours,
  onCancelEditing,
}: Props) {
  const linkClass = `text-primary-600 hover:underline ${focusRingClasses}`

  if (week.reminder_sent_at) {
    return <>Reminder sent {formatDeadline(week.reminder_sent_at)}</>
  }

  if (!isOpen) return null

  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        Remind
        <input
          type="number"
          min={1}
          max={168}
          step={1}
          value={hoursDraft}
          onChange={(e) => onHoursDraftChange(e.target.value)}
          aria-label={`Hours before the deadline to remind members, Week ${week.week_number}`}
          className="w-16 rounded-control border border-gray-200 bg-white p-1 text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        hours before
        <button type="button" onClick={onSaveHours} className={linkClass}>
          Save
        </button>
        <button
          type="button"
          onClick={onCancelEditing}
          className={`hover:underline ${focusRingClasses}`}
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {week.reminders_enabled
        ? `Reminder: ${week.reminder_hours_before}h before deadline`
        : 'Reminder: off'}
      <button type="button" onClick={onToggle} className={linkClass}>
        {week.reminders_enabled ? 'Turn off' : 'Turn on'}
      </button>
      {week.reminders_enabled && (
        <button type="button" onClick={onStartEditing} className={linkClass}>
          Change time
        </button>
      )}
    </span>
  )
}
