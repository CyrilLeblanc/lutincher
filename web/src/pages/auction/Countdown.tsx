// Countdown display: interpolates the absolute deadline on a one-second tick
// supplied by the parent. Highlighted inside the anti-sniping window; shows
// the closing label once the deadline passed (the server has the last word).

import { AUCTION_ROOM_TEXT } from '../../ui/strings'
import { formatDuration, isAntiSniping, remainingSeconds } from './time'

export interface CountdownProps {
  endsAt: number | null
  now: number
}

export function Countdown({ endsAt, now }: CountdownProps) {
  const remaining = remainingSeconds(endsAt, now)
  if (remaining === null) return null
  if (remaining === 0) {
    return <span className="countdown countdown--closed">{AUCTION_ROOM_TEXT.closing}</span>
  }
  const urgent = isAntiSniping(remaining) ? ' countdown--urgent' : ''
  return <span className={`countdown${urgent}`}>{formatDuration(remaining)}</span>
}
