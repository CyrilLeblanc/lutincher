// Presence block of the auction room: connected count and usernames, from
// the global `presence` events. Presentational only.

import { AUCTION_ROOM_TEXT } from '../../ui/strings'
import type { PresenceEntry } from '../../socket/contract'

export interface PresenceListProps {
  presence: readonly PresenceEntry[]
}

export function PresenceList({ presence }: PresenceListProps) {
  if (presence.length === 0) return null
  return (
    <section className="presence">
      <h2>{AUCTION_ROOM_TEXT.presenceTitle}</h2>
      <p className="presence__count">{AUCTION_ROOM_TEXT.presenceCount(presence.length)}</p>
      <p className="presence__names">{presence.map((entry) => entry.user).join(', ')}</p>
    </section>
  )
}
