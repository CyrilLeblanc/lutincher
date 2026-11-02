// Card for a lutin: SVG portrait placeholder, name, rarity badge.
// Props only — the card holds no logic and links to the lutin sheet.

import { Link } from 'react-router-dom'
import { lutinSvgUrl } from '../api/http'
import type { Lutin } from '../socket/contract'
import { lutinPath } from '../ui/routes'
import { LUTIN_CARD_TEXT } from '../ui/strings'
import { RarityBadge } from './RarityBadge'

export interface LutinCardProps {
  lutin: Lutin
}

export function LutinCard({ lutin }: LutinCardProps) {
  return (
    <Link className="lutin-card" to={lutinPath(lutin.id)} title={LUTIN_CARD_TEXT.viewLutin}>
      <span className="lutin-card__frame">
        <img
          src={lutinSvgUrl(lutin.id)}
          alt={LUTIN_CARD_TEXT.imageAlt(lutin.name)}
          loading="lazy"
        />
      </span>
      <span className="lutin-card__body">
        <span className="lutin-card__name">{lutin.name}</span>
        <RarityBadge rarity={lutin.rarity} />
      </span>
    </Link>
  )
}
