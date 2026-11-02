// Stub — future home page: list of current and upcoming auctions with live
// countdowns (J2). Wired to GET /api/auctions + WS auction_started/ended.

import { PAGE_TEXT } from '../ui/strings'

export function AuctionsPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.auctions.title}</h1>
      <p className="page-intro">{PAGE_TEXT.auctions.intro}</p>
    </section>
  )
}
