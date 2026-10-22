// Shared with RosterModal.tsx and MatchupBoxScore.tsx -- both render an identical pill next to a
// bench player on IR, so the markup/styling lives in one place instead of two copies drifting.
export default function IRBadge() {
  return (
    <span className="rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
      IR
    </span>
  )
}
