// Colored pill showing a rarity tier. Pure presentation, driven by props.

import type { Rarity } from '../socket/contract'
import { RARITY_LABELS } from '../ui/strings'

export interface RarityBadgeProps {
  rarity: Rarity
}

export function RarityBadge({ rarity }: RarityBadgeProps) {
  return (
    <span className={`rarity-badge rarity-badge--${rarity}`}>{RARITY_LABELS[rarity]}</span>
  )
}
