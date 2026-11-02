// Pure countdown helpers. The server clock is the only authority (cahier
// §3.3): every server event carrying `ends_in_s` recomputes an absolute local
// deadline (see reducer.ts); these helpers only interpolate and format it.

/** Bids inside this final window extend the auction (anti-sniping, cahier §3.3). */
export const ANTI_SNIPING_WINDOW_S = 10

/** Whole seconds left before the deadline; null when there is none; floored at 0. */
export function remainingSeconds(endsAt: number | null, now: number): number | null {
  if (endsAt === null) return null
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/** Whether the countdown sits in the highlighted anti-sniping window. */
export function isAntiSniping(remaining: number | null): boolean {
  return remaining !== null && remaining > 0 && remaining < ANTI_SNIPING_WINDOW_S
}

/** `m:ss` formatting of a duration in whole seconds (e.g. 90 -> "1:30"). */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Short local time of an epoch-ms timestamp, for the bid history rows. */
export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('fr-FR', { hour12: false })
}
