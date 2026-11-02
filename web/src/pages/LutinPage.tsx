// Stub — future lutin sheet (/lutin/:id): SVG portrait, name, rarity,
// collection value (J4). Wired to /api/lutins/:id.svg.

import { PAGE_TEXT } from '../ui/strings'

export function LutinPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.lutin.title}</h1>
      <p className="page-intro">{PAGE_TEXT.lutin.intro}</p>
    </section>
  )
}
