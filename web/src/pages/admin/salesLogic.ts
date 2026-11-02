// Pure logic of the sales tab (A2–A4): form model with the cahier §3.3
// defaults, typed field validation, and the CreateAuctionRequest builder.
// The contract carries `starts_at` (ISO 8601), so "start in N minutes"
// is computed from an injected clock. No React, no fetch.

import type { CreateAuctionRequest, LeaderboardRow } from '../../socket/contract'

// Cahier §3.3 defaults: start price 50, minimal increment 10, duration 90 s.
export const DEFAULT_START_PRICE = 50
export const DEFAULT_INCREMENT = 10
export const DEFAULT_DURATION_S = 90
export const DEFAULT_START_IN_MIN = 1

/** Opening choice of the sale form. */
export type StartMode = 'now' | 'in_minutes'

/** Raw (string) form values — parsing happens at validation time. */
export interface SalesForm {
  lutinId: string
  startPrice: string
  increment: string
  durationS: string
  startMode: StartMode
  startInMin: string
}

export const EMPTY_SALES_FORM: SalesForm = {
  lutinId: '',
  startPrice: String(DEFAULT_START_PRICE),
  increment: String(DEFAULT_INCREMENT),
  durationS: String(DEFAULT_DURATION_S),
  startMode: 'now',
  startInMin: String(DEFAULT_START_IN_MIN),
}

export type SalesField = keyof SalesForm

/** Client-side form error codes — French wording lives in strings.ts. */
export type SalesFieldError = 'required' | 'positive_int' | 'non_negative_int'

/** At most one error code per field; absent field = valid. */
export type SalesErrors = Partial<Record<SalesField, SalesFieldError>>

/** Strictly positive integer, or null (no float, no sign, no empty string). */
export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value > 0 ? value : null
}

/** Positive-or-null integer, or null. */
export function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= 0 ? value : null
}

/** Client-side validation; the server stays authoritative in all cases. */
export function validateSalesForm(form: SalesForm): SalesErrors {
  const errors: SalesErrors = {}
  if (form.lutinId === '') errors.lutinId = 'required'
  if (parsePositiveInt(form.startPrice) === null) errors.startPrice = 'positive_int'
  if (parsePositiveInt(form.increment) === null) errors.increment = 'positive_int'
  if (parsePositiveInt(form.durationS) === null) errors.durationS = 'positive_int'
  if (form.startMode === 'in_minutes' && parseNonNegativeInt(form.startInMin) === null) {
    errors.startInMin = 'non_negative_int'
  }
  return errors
}

/** True when at least one field carries an error code. */
export function hasSalesErrors(errors: SalesErrors): boolean {
  return Object.values(errors).length > 0
}

/**
 * Builds the request body of POST /api/admin/auctions from a validated form.
 * `now` is injected: immediate start = the injected clock, "in N minutes"
 * = clock + N minutes. The delay is expanded client-side into `starts_at`
 * (the server has no `starts_in_min` field).
 */
export function buildCreateAuctionRequest(form: SalesForm, now: Date): CreateAuctionRequest {
  const delayMin = form.startMode === 'now' ? 0 : parseNonNegativeInt(form.startInMin) ?? 0
  return {
    lutin_id: form.lutinId,
    start_price: parsePositiveInt(form.startPrice) ?? DEFAULT_START_PRICE,
    increment: parsePositiveInt(form.increment) ?? DEFAULT_INCREMENT,
    duration_s: parsePositiveInt(form.durationS) ?? DEFAULT_DURATION_S,
    starts_at: new Date(now.getTime() + delayMin * 60_000).toISOString(),
  }
}

/**
 * Expected JSON answer of POST /api/admin/game/close (contract complement,
 * task E): the frozen podium, same shape as the WS `game_closed` event.
 */
export interface GameClosedResult {
  podium: LeaderboardRow[]
}
