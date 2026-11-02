// Sales tab (A2–A4): schedule a sale from the inventory, watch the
// scheduled/open auctions, close the game. All state and requests live in
// useAdminSales and useAdminInventory; this component only renders. The
// confirmation of the closure is an inline two-step control (no dialog).

import { useState } from 'react'
import { RarityBadge } from '../../components/RarityBadge'
import {
  LAYOUT_TEXT,
  RARITY_LABELS,
  SALES_TEXT,
  AUCTION_STATUS_LABELS,
  salesFieldMessage,
} from '../../ui/strings'
import type { StartMode } from './salesLogic'
import { type UseAdminInventoryResult } from './useAdminInventory'
import { useAdminSales } from './useAdminSales'

export interface SalesTabProps {
  /** Inventory shared with the studio tab (the studio feeds it). */
  inventory: UseAdminInventoryResult
}

interface NumberFieldProps {
  label: string
  value: string
  min: number
  error: string | null
  disabled: boolean
  onChange: (value: string) => void
}

/** One labelled integer input of the schedule form (local, presentational). */
function NumberField({ label, value, min, error, disabled, onChange }: NumberFieldProps) {
  return (
    <label className="form-field">
      <span className="form-field__label">{label}</span>
      <input
        className="text-input"
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
      />
      {error !== null && <span className="form-field__error">{error}</span>}
    </label>
  )
}

export function SalesTab({ inventory }: SalesTabProps) {
  const lutins = inventory.lutins
  const sales = useAdminSales({ lutins })
  const [confirmingClose, setConfirmingClose] = useState(false)
  const lutinError = salesFieldMessage(sales.errors, 'lutinId')
  const startInMinError = salesFieldMessage(sales.errors, 'startInMin')

  const setStartMode = (mode: StartMode): void => {
    sales.updateForm({ startMode: mode })
  }

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>{SALES_TEXT.scheduleTitle}</h2>
        {sales.gameClosed && <p className="admin-hint">{SALES_TEXT.gameClosedHint}</p>}
        {inventory.error !== null && (
          <>
            <p className="form-error" role="alert">
              {inventory.error}
            </p>
            <button type="button" className="button button--ghost" onClick={inventory.reload}>
              {SALES_TEXT.inventoryRetry}
            </button>
          </>
        )}
        {lutins === null && inventory.error === null && (
          <p className="admin-hint" role="status">
            {SALES_TEXT.inventoryLoading}
          </p>
        )}
        {lutins !== null && lutins.length === 0 && (
          <p className="admin-hint">{SALES_TEXT.inventoryEmpty}</p>
        )}
        <form
          className="sales-form"
          onSubmit={(event) => {
            event.preventDefault()
            sales.submit()
          }}
          noValidate
        >
          <label className="form-field sales-form__wide">
            <span className="form-field__label">{SALES_TEXT.lutinLabel}</span>
            <select
              className="text-input"
              value={sales.form.lutinId}
              disabled={sales.submitPending || lutins === null || lutins.length === 0}
              onChange={(event) => sales.updateForm({ lutinId: event.target.value })}
              aria-invalid={lutinError !== null}
            >
              <option value="">{SALES_TEXT.lutinPlaceholder}</option>
              {lutins?.map((lutin) => (
                <option key={lutin.id} value={lutin.id}>
                  {SALES_TEXT.lutinOption(lutin.name, RARITY_LABELS[lutin.rarity])}
                </option>
              ))}
            </select>
            {lutinError !== null && <span className="form-field__error">{lutinError}</span>}
          </label>
          <NumberField
            label={SALES_TEXT.startPriceLabel}
            value={sales.form.startPrice}
            min={1}
            error={salesFieldMessage(sales.errors, 'startPrice')}
            disabled={sales.submitPending}
            onChange={(startPrice) => sales.updateForm({ startPrice })}
          />
          <NumberField
            label={SALES_TEXT.incrementLabel}
            value={sales.form.increment}
            min={1}
            error={salesFieldMessage(sales.errors, 'increment')}
            disabled={sales.submitPending}
            onChange={(increment) => sales.updateForm({ increment })}
          />
          <NumberField
            label={SALES_TEXT.durationLabel}
            value={sales.form.durationS}
            min={1}
            error={salesFieldMessage(sales.errors, 'durationS')}
            disabled={sales.submitPending}
            onChange={(durationS) => sales.updateForm({ durationS })}
          />
          <fieldset className="form-field sales-form__wide" disabled={sales.submitPending}>
            <legend className="form-field__label">{SALES_TEXT.startModeLabel}</legend>
            <div className="sales-start">
              <label className="sales-start__option">
                <input
                  type="radio"
                  name="sales-start-mode"
                  checked={sales.form.startMode === 'now'}
                  onChange={() => setStartMode('now')}
                />
                {SALES_TEXT.startNow}
              </label>
              <label className="sales-start__option">
                <input
                  type="radio"
                  name="sales-start-mode"
                  checked={sales.form.startMode === 'in_minutes'}
                  onChange={() => setStartMode('in_minutes')}
                />
                {SALES_TEXT.startInMinutes}
              </label>
              {sales.form.startMode === 'in_minutes' && (
                <input
                  className="text-input sales-start__delay"
                  type="number"
                  min={0}
                  value={sales.form.startInMin}
                  onChange={(event) => sales.updateForm({ startInMin: event.target.value })}
                  aria-invalid={startInMinError !== null}
                />
              )}
            </div>
            {startInMinError !== null && (
              <span className="form-field__error">{startInMinError}</span>
            )}
          </fieldset>
          {sales.submitError !== null && (
            <p className="form-error sales-form__wide" role="alert">
              {sales.submitError}
            </p>
          )}
          {sales.scheduledName !== null && (
            <p className="admin-success sales-form__wide">
              {SALES_TEXT.scheduled(sales.scheduledName)}
            </p>
          )}
          <div className="sales-form__wide">
            <button
              type="submit"
              className="button"
              disabled={sales.submitPending || sales.gameClosed}
            >
              {sales.submitPending ? SALES_TEXT.submitPending : SALES_TEXT.submit}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>{SALES_TEXT.listTitle}</h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={sales.reloadAuctions}
          >
            {SALES_TEXT.refresh}
          </button>
        </div>
        {sales.auctionsError !== null && (
          <p className="form-error" role="alert">
            {sales.auctionsError}
          </p>
        )}
        {sales.auctions === null && sales.auctionsError === null && (
          <p className="admin-hint" role="status">
            {SALES_TEXT.loadingAuctions}
          </p>
        )}
        {sales.auctions !== null && sales.auctions.length === 0 && (
          <p className="admin-hint">{SALES_TEXT.emptyAuctions}</p>
        )}
        {sales.auctions !== null && sales.auctions.length > 0 && (
          <table className="auction-table">
            <thead>
              <tr>
                <th scope="col">{SALES_TEXT.colStatus}</th>
                <th scope="col">{SALES_TEXT.colLutin}</th>
                <th scope="col">{SALES_TEXT.colPrice}</th>
              </tr>
            </thead>
            <tbody>
              {sales.auctions.map((auction) => (
                <tr key={auction.id}>
                  <td>
                    <span className={`auction-status auction-status--${auction.status}`}>
                      {AUCTION_STATUS_LABELS[auction.status]}
                    </span>
                  </td>
                  <td>
                    <span className="auction-lutin">
                      {auction.lutin.name} <RarityBadge rarity={auction.lutin.rarity} />
                    </span>
                  </td>
                  <td className="auction-price">
                    {auction.current_amount ?? auction.start_price} {LAYOUT_TEXT.pointsUnit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-card">
        <h2>{SALES_TEXT.closeTitle}</h2>
        {sales.gameClosed ? (
          <div className="game-closed-banner">
            <p className="game-closed-banner__title">{SALES_TEXT.gameClosed}</p>
            {sales.podium !== null && sales.podium.length > 0 && (
              <>
                <h3>{SALES_TEXT.podiumTitle}</h3>
                <ol className="podium">
                  {sales.podium.map((row, index) => (
                    <li key={row.user}>
                      {SALES_TEXT.podiumRow(index + 1, row.user, row.value, row.lutins)}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ) : confirmingClose ? (
          <div className="close-confirm">
            <p className="close-confirm__title">{SALES_TEXT.closeConfirmTitle}</p>
            <p className="admin-hint">{SALES_TEXT.closeWarning}</p>
            <div className="studio-actions">
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  setConfirmingClose(false)
                  sales.closeGame()
                }}
                disabled={sales.closePending}
              >
                {sales.closePending ? SALES_TEXT.closePending : SALES_TEXT.closeConfirmGo}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setConfirmingClose(false)}
                disabled={sales.closePending}
              >
                {SALES_TEXT.closeCancel}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button button--danger"
            onClick={() => setConfirmingClose(true)}
          >
            {SALES_TEXT.closeGame}
          </button>
        )}
        {sales.closeError !== null && (
          <p className="form-error" role="alert">
            {sales.closeError}
          </p>
        )}
      </section>
    </div>
  )
}
