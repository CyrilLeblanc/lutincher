// Bid form of the auction room: editable amount (prefixed with the suggested
// bid until the player customizes it). All wording arrives already French;
// submission is delegated — the parent owns the socket send.

import type { ChangeEvent, FormEvent } from 'react'
import { AUCTION_ROOM_TEXT } from '../../ui/strings'

export interface BidFormProps {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  /** Submit disabled (socket down, logged out…); the input stays editable. */
  disabled: boolean
  /** French explanation of why submitting is disabled; null when enabled. */
  disabledReason: string | null
  /** Available balance from /api/me; null while unknown (never optimistic). */
  balance: number | null
  /** French message of the latest server refusal; null when none. */
  error: string | null
  increment: number
}

export function BidForm({
  value,
  onValueChange,
  onSubmit,
  disabled,
  disabledReason,
  balance,
  error,
  increment,
}: BidFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!disabled) onSubmit()
  }

  return (
    <form className="bid-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span className="form-field__label">{AUCTION_ROOM_TEXT.bidAmountLabel}</span>
        <input
          className="text-input"
          name="amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
        />
        <span className="form-field__hint">{AUCTION_ROOM_TEXT.suggestionHint(increment)}</span>
      </label>
      {balance !== null && <p className="bid-form__balance">{AUCTION_ROOM_TEXT.balance(balance)}</p>}
      <button className="button" type="submit" disabled={disabled}>
        {AUCTION_ROOM_TEXT.bidSubmit}
      </button>
      {disabledReason !== null && (
        <p className="bid-form__reason" role="note">
          {disabledReason}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
