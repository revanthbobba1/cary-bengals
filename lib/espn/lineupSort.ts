// Shared starter/bench ordering for any per-player list keyed by ESPN lineup_slot/position --
// extracted out of components/RosterModal.tsx so components/MatchupBoxScore.tsx reuses the same
// logic instead of re-implementing it. Generic over anything with these three fields (both
// RosterPlayer and MatchupPlayerScore qualify).

interface SortableLineupEntry {
  lineup_slot: string
  position: string
  sort_order: number
}

// ESPN's standard starting lineup order, as shown in its own app -- not derivable from the
// payload itself (its own entries array isn't in this order; see backend/app/services/roster.py).
// Slot labels match app/espn_labels.py's LINEUP_SLOTS values exactly.
export const STARTER_SLOT_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  'RB/WR': 2,
  WR: 3,
  'WR/TE': 4,
  TE: 5,
  FLEX: 6,
  OP: 7,
  'D/ST': 8,
  K: 9,
}

// Bench has no ESPN-documented display order we could find -- the payload's own array order
// doesn't match what ESPN's app shows either. Grouping by position (then IR last, since that's
// a distinct status players are pulled out for) is the closest reasonable approximation.
export const BENCH_POSITION_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  'D/ST': 4,
  K: 5,
}

export function compareStarters<T extends SortableLineupEntry>(a: T, b: T): number {
  const slotDiff =
    (STARTER_SLOT_ORDER[a.lineup_slot] ?? 99) - (STARTER_SLOT_ORDER[b.lineup_slot] ?? 99)
  return slotDiff !== 0 ? slotDiff : a.sort_order - b.sort_order
}

// The one place IR-ness is defined -- compareBench and both components rendering an IR badge
// (components/IRBadge.tsx's two call sites) all check this instead of inlining 'IR' separately.
export function isOnIR(lineupSlot: string): boolean {
  return lineupSlot === 'IR'
}

export function compareBench<T extends SortableLineupEntry>(a: T, b: T): number {
  const aIr = isOnIR(a.lineup_slot)
  const bIr = isOnIR(b.lineup_slot)
  if (aIr !== bIr) return aIr ? 1 : -1
  const posDiff =
    (BENCH_POSITION_ORDER[a.position] ?? 99) - (BENCH_POSITION_ORDER[b.position] ?? 99)
  return posDiff !== 0 ? posDiff : a.sort_order - b.sort_order
}
