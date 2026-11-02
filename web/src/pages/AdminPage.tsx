// Stub — future admin studio: generate lutins (rarity auto or forced, live
// preview via /api/admin/lutins/preview) and schedule auctions (A1–A3).

import { PAGE_TEXT } from '../ui/strings'

export function AdminPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.admin.title}</h1>
      <p className="page-intro">{PAGE_TEXT.admin.intro}</p>
    </section>
  )
}
