'use client'

import { useEffect, useRef, useState } from 'react'

const FLASH_DURATION_MS = 1500

// Briefly flags which ids changed value since this hook's last run -- used to pulse-highlight a
// score or stat that just updated from a poll, so a live page doesn't just silently swap in new
// numbers. Returns an empty Set on the very first render (nothing to compare against yet) and
// again once each change's flash duration elapses.
export function useChangeFlash(values: Record<string, string | number>): Set<string> {
  const prevRef = useRef<Record<string, string | number> | null>(null)
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set())
  const valuesKey = JSON.stringify(values)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = values
    if (prev === null) return

    const changed = new Set<string>()
    for (const [id, value] of Object.entries(values)) {
      if (id in prev && prev[id] !== value) changed.add(id)
    }
    if (changed.size === 0) return

    setFlashingIds(changed)
    const timeout = setTimeout(() => setFlashingIds(new Set()), FLASH_DURATION_MS)
    return () => clearTimeout(timeout)
    // Deliberately keyed on `valuesKey` (content), not the `values` object identity, which is a
    // new object every render regardless of whether its contents actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  return flashingIds
}
