// Pure leaderboard helpers: ranking order (cahier §3.4 tie-breaks — value,
// then lutin count, then alphabetical ex æquo) and the live fold of server
// events. No React — trivially unit-testable.

import type { LeaderboardRow, ServerEvent } from '../socket/contract'

/** Stable empty value for hook initial states. */
export const EMPTY_LEADERBOARD: readonly LeaderboardRow[] = []

/** Sorted copy of the rows, best first. */
export function sortLeaderboard(rows: readonly LeaderboardRow[]): readonly LeaderboardRow[] {
  return [...rows].sort(
    (a, b) =>
      b.value - a.value || b.lutins - a.lutins || a.user.localeCompare(b.user),
  )
}

/** Live fold: a `leaderboard` event carries the full refreshed rows. */
export function applyLeaderboardEvent(
  rows: readonly LeaderboardRow[],
  event: ServerEvent,
): readonly LeaderboardRow[] {
  if (event.type === 'leaderboard') return sortLeaderboard(event.rows)
  return rows
}
