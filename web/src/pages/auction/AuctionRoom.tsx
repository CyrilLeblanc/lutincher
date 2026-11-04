// The live auction room: REST snapshot + WS differentials (bid / auction_ended
// / outbid / presence), server-authoritative countdown, bid form with
// suggested amount, live history and final outcome. State reduction lives in
// the pure reducer.ts; this component only wires hooks, callbacks and views.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_PATHS, ApiError, get } from '../../api/http'
import { useAuth } from '../../auth/AuthContext'
import { LutinCard } from '../../components/LutinCard'
import { LoadState } from '../../components/LoadState'
import { useSocket } from '../../socket/SocketContext'
import type { AuctionView, Id, PresenceEntry, UserMe } from '../../socket/contract'
import { ROUTE_PATHS } from '../../ui/routes'
import { AUCTION_ROOM_TEXT, apiErrorMessage, messageForError } from '../../ui/strings'
import { useLiveSnapshot } from '../useLiveSnapshot'
import { BidForm } from './BidForm'
import { BidHistory } from './BidHistory'
import { Countdown } from './Countdown'
import { OutcomePanel } from './OutcomePanel'
import { PresenceList } from './PresenceList'
import { initRoom, roomFromSnapshot, roomReducer, suggestedBid, type RoomState } from './reducer'
import { isAntiSniping, remainingSeconds } from './time'
import { useNow } from './useNow'

/** Room-specific failure wording: a 404 on the detail route names the sale. */
function roomFailureMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'not_found') return AUCTION_ROOM_TEXT.notFound
  return messageForError(cause)
}

export interface AuctionRoomProps {
  roomId: Id
}

export function AuctionRoom({ roomId }: AuctionRoomProps) {
  const { user } = useAuth()
  const { status, send, subscribe } = useSocket()
  const me = user?.username ?? null

  const live = useLiveSnapshot<RoomState, AuctionView>({
    key: roomId,
    initial: initRoom(roomId),
    fetchSnapshot: () => get<AuctionView>(`${API_PATHS.auctions}/${roomId}`),
    fromSnapshot: (view, now) => roomFromSnapshot(view, now, roomId),
    applyEvent: (state, event, now) => roomReducer(state, event, now, me),
    failureMessage: roomFailureMessage,
  })

  const [presence, setPresence] = useState<readonly PresenceEntry[]>([])
  const [bidError, setBidError] = useState<string | null>(null)
  // Balance slot tagged with its owner: a `me` change derives null during
  // render (no synchronous reset in an effect), the fetch echoes fill it.
  const [balanceSlot, setBalanceSlot] = useState<{ me: string | null; value: number | null }>({
    me: null,
    value: null,
  })
  const balance = balanceSlot.me === me ? balanceSlot.value : null
  const [balanceKey, setBalanceKey] = useState(0)

  // Page-level events the reducer does not own: presence, WS refusals, and
  // the money moments that justify re-reading /api/me (never optimistic).
  useEffect(
    () =>
      subscribe((event) => {
        switch (event.type) {
          case 'presence':
            setPresence(event.online)
            break
          case 'error':
            setBidError(apiErrorMessage(event.code))
            break
          case 'bid':
            if (event.auction_id === roomId && me !== null && event.bidder === me) {
              setBalanceKey((count) => count + 1)
            }
            break
          case 'outbid':
            if (event.auction_id === roomId) setBalanceKey((count) => count + 1)
            break
          case 'auction_ended':
            if (event.auction_id === roomId) setBalanceKey((count) => count + 1)
            break
          default:
            break
        }
      }),
    [subscribe, roomId, me],
  )

  // Balance: fresh /api/me echo on load and after every escrow change
  // (bid of mine, outbid freeing funds, end debiting the winner). Never
  // optimistic: the display only moves on a server answer.
  useEffect(() => {
    if (me === null) return
    let cancelled = false
    get<UserMe>(API_PATHS.me)
      .then((fetched) => {
        if (!cancelled) setBalanceSlot({ me, value: fetched.points_available })
      })
      .catch(() => {
        if (!cancelled) setBalanceSlot({ me, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [me, balanceKey])

  // Bid amount: follows the suggestion until the player customizes it, and
  // falls back to it again after each submitted bid.
  const [customAmount, setCustomAmount] = useState<string | null>(null)
  const now = useNow()
  const { state } = live
  const view = state.view
  const suggestion =
    view !== null && view.status === 'open' && state.outcome === null ? suggestedBid(view) : null
  const amountValue = customAmount ?? (suggestion !== null ? String(suggestion) : '')

  const handleSubmit = (): void => {
    setBidError(null)
    const amount = Number(amountValue)
    if (!Number.isInteger(amount) || amount <= 0) {
      setBidError(AUCTION_ROOM_TEXT.invalidAmount)
      return
    }
    if (!send({ type: 'bid', auction_id: roomId, amount })) {
      setBidError(AUCTION_ROOM_TEXT.socketClosed)
      return
    }
    setCustomAmount(null)
  }

  if (live.phase === 'failed') {
    return (
      <section className="page">
        <h1>{AUCTION_ROOM_TEXT.roomTitle}</h1>
        <LoadState phase="failed" message={live.message} onRetry={live.retry} />
      </section>
    )
  }
  if (view === null) {
    return (
      <section className="page">
        <h1>{AUCTION_ROOM_TEXT.roomTitle}</h1>
        {live.phase === 'ready' ? (
          <p className="page-intro">{AUCTION_ROOM_TEXT.notFound}</p>
        ) : (
          <LoadState phase={live.phase} message={live.message} onRetry={live.retry} />
        )}
      </section>
    )
  }

  const socketDown = status !== 'open'
  // J7: an open sale inside its last seconds (deadline from the server clock).
  const closingSoon =
    state.outcome === null && view.status === 'open' && isAntiSniping(remainingSeconds(state.endsAt, now))
  const bidDisabledReason =
    me === null ? AUCTION_ROOM_TEXT.loginToBid : socketDown ? AUCTION_ROOM_TEXT.socketClosed : null

  return (
    <section className="page auction-room">
      <p className="auction-room__back">
        <Link className="header-link" to={ROUTE_PATHS.auctions}>
          {AUCTION_ROOM_TEXT.backToList}
        </Link>
      </p>
      <h1>{view.lutin.name}</h1>
      {status === 'reconnecting' && (
        <p className="banner banner--warning" role="status">
          {AUCTION_ROOM_TEXT.reconnecting}
        </p>
      )}
      {state.outbid !== null && (
        <p className="banner banner--alert" role="alert">
          {AUCTION_ROOM_TEXT.outbidNotice(state.outbid.by, state.outbid.amount)}
        </p>
      )}

      {closingSoon && (
        <p className="banner banner--warning" role="status">
          {AUCTION_ROOM_TEXT.closingSoon}
        </p>
      )}

      <div className="auction-room__grid">
        <div className="auction-room__lutin">
          <LutinCard lutin={view.lutin} />
          <dl className="auction-room__facts">
            <div className="auction-room__fact">
              <dt>{AUCTION_ROOM_TEXT.factStartPrice}</dt>
              <dd>{AUCTION_ROOM_TEXT.points(view.start_price)}</dd>
            </div>
            <div className="auction-room__fact">
              <dt>{AUCTION_ROOM_TEXT.factIncrement}</dt>
              <dd>{AUCTION_ROOM_TEXT.points(view.increment)}</dd>
            </div>
          </dl>
        </div>

        <div className="auction-room__side">
          {state.outcome !== null ? (
            <OutcomePanel
              outcome={state.outcome}
              lutinName={view.lutin.name}
              isMe={me !== null && state.outcome.winner === me}
            />
          ) : view.status === 'scheduled' ? (
            <p className="banner" role="note">
              {AUCTION_ROOM_TEXT.scheduledNotice}
            </p>
          ) : view.status === 'ended' ? (
            <p className="banner" role="note">
              {AUCTION_ROOM_TEXT.alreadyEnded}
            </p>
          ) : (
            <>
              <div className="auction-room__chrono">
                <span className="auction-room__chrono-label">
                  {AUCTION_ROOM_TEXT.chronoLabel}
                </span>
                <Countdown endsAt={state.endsAt} now={now} />
              </div>
              <p className="auction-room__antisnip">{AUCTION_ROOM_TEXT.antiSniping}</p>
              <BidForm
                value={amountValue}
                onValueChange={setCustomAmount}
                onSubmit={handleSubmit}
                disabled={socketDown || me === null}
                disabledReason={bidDisabledReason}
                balance={balance}
                error={bidError}
                increment={view.increment}
              />
            </>
          )}
          <PresenceList presence={presence} />
        </div>
      </div>

      <BidHistory bids={state.bids} />
    </section>
  )
}
