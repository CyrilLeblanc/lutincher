// Live bid history of the auction room: newest first, derived from the `bid`
// events folded by the room reducer. Presentational only.

import { AUCTION_ROOM_TEXT } from '../../ui/strings'
import type { BidEntry } from './reducer'
import { formatClock } from './time'

export interface BidHistoryProps {
  bids: readonly BidEntry[]
}

export function BidHistory({ bids }: BidHistoryProps) {
  return (
    <section className="bid-history">
      <h2>{AUCTION_ROOM_TEXT.bidHistoryTitle}</h2>
      {bids.length === 0 ? (
        <p className="bid-history__empty">{AUCTION_ROOM_TEXT.noBids}</p>
      ) : (
        <ul className="bid-history__list">
          {bids.map((bid) => (
            <li className="bid-history__row" key={bid.seq}>
              <span className="bid-history__amount">{AUCTION_ROOM_TEXT.bidAmount(bid.amount)}</span>
              <span className="bid-history__bidder">{bid.bidder}</span>
              <span className="bid-history__time">{formatClock(bid.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
