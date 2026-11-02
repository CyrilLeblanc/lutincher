// Pure live-auction reduction: REST snapshots build the base state, server
// events fold into it. No React here — the clock arrives as a `now` parameter
// (epoch ms) so the whole module is unit-testable with an injected clock.
//
// Idempotence: the transport guarantees journal order (global seq) but the
// pages may fold the same event twice (snapshot race, sync replay), so every
// case is safe to apply again (duplicate seq / stale amount are no-ops).

import type { AuctionView, Id, ServerEvent } from '../../socket/contract'

/** Deadline (epoch ms) implied by a server `ends_in_s` received at `now`. */
export function deadlineFromEndsIn(endsInS: number | null, now: number): number | null {
  return endsInS === null ? null : now + endsInS * 1000
}

// --- Auction list (home page) -------------------------------------------------

/** One auction on the home list: latest view + interpolated local deadline. */
export interface AuctionEntry {
  readonly view: AuctionView
  readonly endsAt: number | null
}

export interface AuctionsState {
  readonly entries: readonly AuctionEntry[]
}

export const EMPTY_AUCTIONS: AuctionsState = { entries: [] }

/** Base state from `GET /api/auctions` (open + scheduled sales only). */
export function initAuctions(views: readonly AuctionView[], now: number): AuctionsState {
  const entries = views
    .filter((view) => view.status === 'open' || view.status === 'scheduled')
    .map((view) => ({ view, endsAt: deadlineFromEndsIn(view.ends_in_s, now) }))
  return { entries }
}

function upsertEntry(state: AuctionsState, entry: AuctionEntry): AuctionsState {
  const others = state.entries.filter((existing) => existing.view.id !== entry.view.id)
  return { entries: [...others, entry] }
}

function mapEntryById(
  state: AuctionsState,
  id: Id,
  patch: (entry: AuctionEntry) => AuctionEntry,
): AuctionsState {
  let found = false
  const entries = state.entries.map((entry) => {
    if (entry.view.id !== id) return entry
    found = true
    return patch(entry)
  })
  return found ? { entries } : state
}

/** Live fold of one server event into the home list state. */
export function auctionsReducer(
  state: AuctionsState,
  event: ServerEvent,
  now: number,
): AuctionsState {
  switch (event.type) {
    case 'auction_started': {
      const view: AuctionView = { ...event.auction, status: 'open' }
      return upsertEntry(state, { view, endsAt: deadlineFromEndsIn(view.ends_in_s, now) })
    }
    case 'bid':
      return mapEntryById(state, event.auction_id, (entry) => {
        const previous = entry.view.current_amount
        // Stale or replayed bid: amounts only ever grow on an open auction.
        if (previous !== null && event.amount <= previous) return entry
        const view: AuctionView = {
          ...entry.view,
          current_amount: event.amount,
          current_bidder: event.bidder,
        }
        return { view, endsAt: deadlineFromEndsIn(event.ends_in_s, now) }
      })
    case 'outbid':
      // Sent only to the outbidden player; the price still moved for them.
      return mapEntryById(state, event.auction_id, (entry) => {
        const previous = entry.view.current_amount
        if (previous !== null && event.amount <= previous) return entry
        const view: AuctionView = { ...entry.view, current_amount: event.amount, current_bidder: event.by }
        return { view, endsAt: entry.endsAt }
      })
    case 'auction_ended':
      return { entries: state.entries.filter((entry) => entry.view.id !== event.auction_id) }
    default:
      return state
  }
}

/** Open sales for the home list. */
export function openEntries(state: AuctionsState): readonly AuctionEntry[] {
  return state.entries.filter((entry) => entry.view.status === 'open')
}

/** Scheduled sales for the home list. */
export function scheduledEntries(state: AuctionsState): readonly AuctionEntry[] {
  return state.entries.filter((entry) => entry.view.status === 'scheduled')
}

// --- Auction room (/vente/:id) --------------------------------------------------

/** One entry of the bid history (the `bid` event carries no timestamp: `at` is
 * the local reception time, `seq` the journal identity used for dedupe). */
export interface BidEntry {
  readonly seq: number
  readonly amount: number
  readonly bidder: string
  readonly at: number
}

/** Final state carried by `auction_ended` (null winner = no bid at all). */
export interface AuctionOutcome {
  readonly winner: string | null
  readonly amount: number | null
  readonly seq: number
}

/** "You have been outbid" notice — the server sends `outbid` to the outbidden only. */
export interface OutbidNotice {
  readonly by: string
  readonly amount: number
  readonly seq: number
}

export interface RoomState {
  readonly roomId: Id
  readonly view: AuctionView | null
  readonly endsAt: number | null
  /** Newest first (highest seq first). */
  readonly bids: readonly BidEntry[]
  readonly outcome: AuctionOutcome | null
  readonly outbid: OutbidNotice | null
}

/** Live state before any snapshot: only `auction_started` can seed the view. */
export function initRoom(roomId: Id): RoomState {
  return { roomId, view: null, endsAt: null, bids: [], outcome: null, outbid: null }
}

/** Base state from `GET /api/auctions/:id`. */
export function roomFromSnapshot(view: AuctionView, now: number, roomId: Id): RoomState {
  if (view.id !== roomId) return initRoom(roomId)
  return { ...initRoom(roomId), view, endsAt: deadlineFromEndsIn(view.ends_in_s, now) }
}

/**
 * Live fold of one server event into the room state. `me` is the current
 * username (or null): it only drives the outbid-notice lifecycle, never the
 * auction facts. Events for other auctions are ignored.
 */
export function roomReducer(
  state: RoomState,
  event: ServerEvent,
  now: number,
  me: string | null,
): RoomState {
  // The auction is over: everything but a replay of the same end is noise.
  if (state.outcome !== null) return state

  switch (event.type) {
    case 'auction_started': {
      if (event.auction.id !== state.roomId) return state
      const view: AuctionView = { ...event.auction, status: 'open' }
      return { ...state, view, endsAt: deadlineFromEndsIn(view.ends_in_s, now) }
    }
    case 'bid': {
      if (event.auction_id !== state.roomId || state.view === null) return state
      if (state.bids.some((bid) => bid.seq === event.seq)) return state
      const previous = state.view.current_amount
      if (previous !== null && event.amount <= previous) return state
      const view: AuctionView = {
        ...state.view,
        status: 'open',
        current_amount: event.amount,
        current_bidder: event.bidder,
      }
      const bids: readonly BidEntry[] = [
        { seq: event.seq, amount: event.amount, bidder: event.bidder, at: now },
        ...state.bids,
      ]
      // Our own bid echoed back: the outbid notice is obsolete.
      const outbid = me !== null && event.bidder === me ? null : state.outbid
      return { ...state, view, endsAt: deadlineFromEndsIn(event.ends_in_s, now), bids, outbid }
    }
    case 'outbid': {
      if (event.auction_id !== state.roomId || state.view === null) return state
      if (state.outbid !== null && state.outbid.seq === event.seq) return state
      const view: AuctionView = {
        ...state.view,
        current_amount: event.amount,
        current_bidder: event.by,
      }
      return { ...state, view, outbid: { by: event.by, amount: event.amount, seq: event.seq } }
    }
    case 'auction_ended': {
      if (event.auction_id !== state.roomId) return state
      const outcome: AuctionOutcome = {
        winner: event.winner,
        amount: event.amount,
        seq: event.seq,
      }
      return { ...state, endsAt: null, outbid: null, outcome }
    }
    default:
      return state
  }
}

/** Suggested next bid: current + increment, or the start price for the first
 * bid (cahier §3.3). */
export function suggestedBid(view: AuctionView): number {
  return view.current_amount !== null ? view.current_amount + view.increment : view.start_price
}
