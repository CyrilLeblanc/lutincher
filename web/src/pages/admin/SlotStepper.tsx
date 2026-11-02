// One slot row of the studio: ‹ asset › cycler. Presentational only — the
// filtered asset list and the current id arrive as props, steps bubble up
// and the final choice stays server-validated.

import type { LutinAsset, LutinSlot } from '../../socket/contract'
import { RarityBadge } from '../../components/RarityBadge'
import { ADMIN_TEXT } from '../../ui/strings'

export interface SlotStepperProps {
  slot: LutinSlot
  /** Assets of the slot capped at the forced tier (all of them in auto). */
  assets: LutinAsset[]
  /** Asset currently displayed (pin if any, else the preview's choice). */
  currentId: string | undefined
  disabled: boolean
  onStep: (slot: LutinSlot['id'], delta: 1 | -1) => void
}

export function SlotStepper({ slot, assets, currentId, disabled, onStep }: SlotStepperProps) {
  // Primary lookup in the filtered list (the one the admin cycles through);
  // fallback to the full list: the current id may briefly sit outside the
  // filtered list right after the tier was lowered.
  const current =
    assets.find((asset) => asset.id === currentId) ??
    slot.assets.find((asset) => asset.id === currentId)

  return (
    <div className="slot-stepper">
      <span className="slot-stepper__label">{slot.label}</span>
      <span className="slot-stepper__control">
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          aria-label={ADMIN_TEXT.stepBack(slot.label)}
          onClick={() => onStep(slot.id, -1)}
        >
          ‹
        </button>
        <span className="slot-stepper__asset">{current?.label ?? ADMIN_TEXT.unknownAsset}</span>
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          aria-label={ADMIN_TEXT.stepForward(slot.label)}
          onClick={() => onStep(slot.id, 1)}
        >
          ›
        </button>
      </span>
      {current !== undefined && <RarityBadge rarity={current.rarity} />}
    </div>
  )
}
