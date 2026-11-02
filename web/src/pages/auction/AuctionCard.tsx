// One auction on the home list: lutin card, price line and countdown for open
// sales; upcoming pill for scheduled ones. Presentational only.

import { Link } from 'react-router-dom'
import { LutinCard } from '../../components/LutinCard'
import { auctionPath } from '../../ui/routes'
import { AUCTIONS_TEXT } from '../../ui/strings'
import { Countdown } from './Countdown'
import type { AuctionEntry } from './reducer'

export interface AuctionCardProps {
  entry: AuctionEntry
  now: number
}

export function AuctionCard({ entry, now }: AuctionCardProps) {
  const { view } = entry
  const isOpen = view.status === 'open'
  return (
    <article className="auction-card">
      <LutinCard lutin={view.lutin} />
      <div className="auction-card__meta">
        <p className="auction-card__price">
          {isOpen && view.current_amount !== null
            ? AUCTIONS_TEXT.currentPrice(view.current_amount)
            : AUCTIONS_TEXT.startPrice(view.start_price)}
        </p>
        {isOpen ? (
          <Countdown endsAt={entry.endsAt} now={now} />
        ) : (
          <span className="auction-card__upcoming">{AUCTIONS_TEXT.upcoming}</span>
        )}
        <Link className="button auction-card__link" to={auctionPath(view.id)}>
          {AUCTIONS_TEXT.joinRoom}
        </Link>
      </div>
    </article>
  )
}
