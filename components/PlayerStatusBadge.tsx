// Small red pill for a player who can't score this week (IR, OUT). Shared by IRBadge and
// MatchupBoxScore so the markup/styling lives in one place instead of drifting copies.
export default function PlayerStatusBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
      {label}
    </span>
  )
}
