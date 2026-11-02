// One-second tick: re-renders the caller with the current clock so countdowns
// interpolate their absolute deadlines. The interval is always cleaned up, and
// a throttled tab self-corrects on wake (deadlines are absolute epoch ms).

import { useEffect, useState } from 'react'

export const TICK_INTERVAL_MS = 1000

export function useNow(intervalMs: number = TICK_INTERVAL_MS): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
