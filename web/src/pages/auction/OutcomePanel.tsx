// Final state of an auction room (event `auction_ended`): winner and price,
// "no bid" case, and the winning lutin named when the current user won it.

import { AUCTION_ROOM_TEXT } from '../../ui/strings'
import type { AuctionOutcome } from './reducer'

export interface OutcomePanelProps {
  outcome: AuctionOutcome
  lutinName: string
  /** Whether the current user is the winner. */
  isMe: boolean
}

export function OutcomePanel({ outcome, lutinName, isMe }: OutcomePanelProps) {
  const { winner, amount } = outcome
  return (
    <section className="auction-outcome">
      <h2>{AUCTION_ROOM_TEXT.endedTitle}</h2>
      {winner !== null && amount !== null ? (
        isMe ? (
          <p className="auction-outcome__win" role="status">
            {AUCTION_ROOM_TEXT.endedYou(lutinName, amount)}
          </p>
        ) : (
          <p>{AUCTION_ROOM_TEXT.endedWinner(winner, amount)}</p>
        )
      ) : (
        <p>{AUCTION_ROOM_TEXT.endedNoBid}</p>
      )}
    </section>
  )
}
