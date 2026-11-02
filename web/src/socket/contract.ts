// Wire contract of Lutincher — exact TypeScript mirror of the message contract
// (CAHIER_DES_CHARGES.md §5) plus the REST complements of docs/PLAN.md.
//
// Ids are UUIDs serialized as strings: the PostgreSQL schema of docs/PLAN.md is
// the source of truth and the integers of the cahier examples are placeholders.

/** Entity id (UUID string). */
export type Id = string

/** Lutin rarity tiers. Note: 'epique' without accent, as in the DB CHECK. */
export type Rarity = 'commun' | 'rare' | 'epique' | 'legendaire'

export type UserRole = 'player' | 'admin'

export type AuctionStatus = 'scheduled' | 'open' | 'ended' | 'cancelled'

/** Error codes carried by WS `error` events (cahier §5). */
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'bid_too_low'
  | 'insufficient_funds'
  | 'auction_not_open'
  | 'malformed_message'
  | 'message_too_large'
  | 'rate_limited'

// --- Shared domain views -----------------------------------------------------

export interface Lutin {
  id: Id
  seed: number
  name: string
  rarity: Rarity
}

/**
 * Auction as broadcast by `auction_started` and served by `GET /api/auctions`.
 * The cahier fields (id, lutin, start_price, increment, ends_in_s) come first;
 * the rest are the REST complements of docs/PLAN.md (current price, status).
 */
export interface AuctionView {
  id: Id
  lutin: Lutin
  start_price: number
  increment: number
  /** Seconds left, server clock authoritative; null while not open. */
  ends_in_s: number | null
  status: AuctionStatus
  duration_s: number
  /** Highest bid so far; null before the first bid. */
  current_amount: number | null
  /** Username of the highest bidder; null before the first bid. */
  current_bidder: string | null
}

/** Escrow reservation exposed by `GET /api/me`. */
export interface Reservation {
  auction_id: Id
  amount: number
}

/** `GET /api/me` — profile, balance, reservations. */
export interface UserMe {
  id: Id
  username: string
  role: UserRole
  points_total: number
  points_available: number
  reserved: Reservation[]
}

/** Leaderboard row (WS `leaderboard` and `GET /api/leaderboard`). */
export interface LeaderboardRow {
  user: string
  /** Collection value = sum of the rarity values of the won lutins. */
  value: number
  lutins: number
}

/** Presence entry (WS `presence`). */
export interface PresenceEntry {
  user: string
}

// --- WebSocket: client → server ----------------------------------------------

export type ClientMessage =
  | { type: 'bid'; auction_id: Id; amount: number }
  | { type: 'sync'; last_seq: number }
  | { type: 'ping' }

// --- WebSocket: server → client ----------------------------------------------
// Every event carries the global sequence number of the append-only journal.

export type ServerEvent =
  | { type: 'auction_started'; auction: AuctionView; seq: number }
  | {
      type: 'bid'
      auction_id: Id
      amount: number
      bidder: string
      ends_in_s: number
      seq: number
    }
  | {
      type: 'auction_ended'
      auction_id: Id
      /** Null when the auction closed without any bid. */
      winner: string | null
      amount: number | null
      seq: number
    }
  | { type: 'outbid'; auction_id: Id; by: string; amount: number; seq: number }
  | { type: 'presence'; online: PresenceEntry[]; seq: number }
  | { type: 'leaderboard'; rows: LeaderboardRow[]; seq: number }
  | { type: 'game_closed'; podium: LeaderboardRow[]; seq: number }
  | { type: 'sync'; events: ServerEvent[]; seq: number }
  | { type: 'error'; code: ErrorCode; detail: string; seq: number }

// --- REST payloads (cahier §5 + complements of docs/PLAN.md) ------------------

/** Body of `POST /api/auth/register` and `POST /api/auth/login`. */
export interface AuthRequest {
  username: string
  password: string
}

/** Response of the auth endpoints: the JWT. */
export interface AuthResponse {
  token: string
}

/** Slots of the procedural generator (assets spec of docs/PLAN.md). */
export type SlotId = 'background' | 'body' | 'ears' | 'eyes' | 'hat' | 'accessory'

/** Chosen asset id per slot; hat/accessory may be absent (the `none` option). */
export type LutinLayers = Partial<Record<SlotId, string>>

export interface LutinAsset {
  id: string
  label: string
  rarity: Rarity
}

export interface LutinSlot {
  id: SlotId
  /** Stacking order: background 0 … accessory 5. */
  z: number
  label: string
  assets: LutinAsset[]
}

/** `GET /api/admin/lutins/parts` — full manifest for the studio. */
export interface PartsManifest {
  slots: LutinSlot[]
}

/** Body of `POST /api/admin/lutins/preview` and `POST /api/admin/lutins`. */
export interface LutinSpecRequest {
  seed?: number
  rarity?: Rarity
  overrides?: LutinLayers
}

/** `POST /api/admin/lutins/preview` — generated lutin with its assembled SVG. */
export interface LutinPreview {
  seed: number
  rarity: Rarity
  name: string
  manifest: LutinLayers
  svg: string
}

/** `POST /api/admin/lutins` — created lutin (same as preview, without svg). */
export type CreatedLutin = Omit<LutinPreview, 'svg'>

/** Body of `POST /api/admin/auctions` (absent `starts_at` = as soon as possible). */
export interface CreateAuctionRequest {
  lutin_id: Id
  start_price: number
  increment: number
  duration_s: number
  /** Opening time, ISO 8601 timestamp. */
  starts_at: string
}

// --- REST snapshot envelopes (the server wraps its lists) ---------------------

/** `GET /api/auctions` — scheduled + open auctions. */
export interface AuctionsSnapshot {
  auctions: AuctionView[]
}

/** `GET /api/leaderboard`. */
export interface LeaderboardSnapshot {
  rows: LeaderboardRow[]
}

/** One lutin won at auction, with its collection value. */
export interface CollectionLutin extends Lutin {
  value: number
}

/** `GET /api/me/collection` — lutins won by the caller, oldest win first. */
export interface CollectionSnapshot {
  lutins: CollectionLutin[]
}

/** `GET /api/game` — page-load game state (live path = WS `game_closed`). */
export interface GameState {
  closed: boolean
  podium: LeaderboardRow[] | null
}

/** Narrowing guard shared by the HTTP client and the socket parser. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
