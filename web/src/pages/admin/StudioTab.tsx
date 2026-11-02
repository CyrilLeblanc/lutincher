// Studio tab (A1): the live lutin designer. All state and requests live in
// useAdminStudio; this component only renders the rarity selector, the slot
// steppers, the live preview panel and the save action.

import { RarityBadge } from '../../components/RarityBadge'
import { ADMIN_TEXT, RARITY_LABELS } from '../../ui/strings'
import { manifestRows, parseRarityChoice, svgDataUri, RARITY_TIERS } from './studioLogic'
import { SlotStepper } from './SlotStepper'
import { useAdminStudio } from './useAdminStudio'

export interface StudioTabProps {
  /** Refreshes the inventory so the saved lutin joins the sales selector. */
  onLutinCreated: () => void
}

export function StudioTab({ onLutinCreated }: StudioTabProps) {
  const studio = useAdminStudio({ onCreated: onLutinCreated })

  return (
    <div className="admin-grid">
      <section className="admin-card studio-preview">
        <h2>{ADMIN_TEXT.previewTitle}</h2>
        {studio.previewError !== null && (
          <p className="form-error" role="alert">
            {studio.previewError}
          </p>
        )}
        {studio.preview !== null ? (
          <>
            <span className="studio-preview__frame">
              <img
                src={svgDataUri(studio.preview.svg)}
                alt={ADMIN_TEXT.previewAlt(studio.preview.name)}
              />
            </span>
            <label className="form-field">
              <span className="form-field__label">{ADMIN_TEXT.nameLabel}</span>
              <input
                className="text-input"
                value={studio.nameValue}
                onChange={(event) => studio.setName(event.target.value)}
              />
            </label>
            <span className="studio-preview__meta">
              <RarityBadge rarity={studio.preview.rarity} />
              <span className="studio-preview__seed">{ADMIN_TEXT.seedLabel(studio.preview.seed)}</span>
            </span>
            <h3>{ADMIN_TEXT.manifestTitle}</h3>
            <ul className="manifest-list">
              {manifestRows(studio.preview, studio.slots).map((row) => (
                <li key={row.slotId}>
                  <span>{row.slotLabel}</span>
                  <span>{row.assetLabel}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="admin-hint">{ADMIN_TEXT.previewPending}</p>
        )}
        {studio.previewPending && studio.preview !== null && (
          <p className="admin-hint" role="status">
            {ADMIN_TEXT.previewPending}
          </p>
        )}
      </section>

      <section className="admin-card studio-controls">
        <h2>{ADMIN_TEXT.designerTitle}</h2>
        <label className="form-field">
          <span className="form-field__label">{ADMIN_TEXT.rarityLabel}</span>
          <select
            className="text-input"
            value={studio.rarity}
            onChange={(event) => {
              const choice = parseRarityChoice(event.target.value)
              if (choice !== null) studio.setRarity(choice)
            }}
          >
            <option value="auto">{ADMIN_TEXT.rarityAuto}</option>
            {RARITY_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {RARITY_LABELS[tier]}
              </option>
            ))}
          </select>
          {studio.rarity !== 'auto' && (
            <span className="form-field__hint">{ADMIN_TEXT.rarityForcedHint}</span>
          )}
        </label>

        {studio.slots !== null ? (
          <div className="slot-list">
            {studio.steppers.map((stepper) => (
              <SlotStepper
                key={stepper.slot.id}
                slot={stepper.slot}
                assets={stepper.assets}
                currentId={stepper.currentId}
                disabled={studio.preview === null}
                onStep={studio.stepSlot}
              />
            ))}
          </div>
        ) : studio.partsError !== null ? (
          <>
            <p className="form-error" role="alert">
              {studio.partsError}
            </p>
            <button type="button" className="button button--ghost" onClick={studio.reloadParts}>
              {ADMIN_TEXT.partsRetry}
            </button>
          </>
        ) : (
          <p className="admin-hint" role="status">
            {ADMIN_TEXT.loadingParts}
          </p>
        )}

        <div className="studio-actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={studio.rerollAll}
            disabled={studio.previewPending}
          >
            {ADMIN_TEXT.rerollAll}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={studio.rerollName}
            disabled={studio.previewPending || studio.preview === null}
          >
            {ADMIN_TEXT.rerollName}
          </button>
        </div>
        <button
          type="button"
          className="button"
          onClick={studio.save}
          disabled={studio.savePending || studio.preview === null}
        >
          {studio.savePending ? ADMIN_TEXT.savePending : ADMIN_TEXT.save}
        </button>
        {studio.saveError !== null && (
          <p className="form-error" role="alert">
            {studio.saveError}
          </p>
        )}
        {studio.savedName !== null && <p className="admin-success">{ADMIN_TEXT.savedLutin(studio.savedName)}</p>}
      </section>
    </div>
  )
}
