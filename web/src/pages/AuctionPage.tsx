// Stub — future live auction room (/vente/:id): lutin, bid history fed by the
// WS channel, bid button with suggested amount, server-clock countdown (J3).

import { PAGE_TEXT } from '../ui/strings'

export function AuctionPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.auction.title}</h1>
      <p className="page-intro">{PAGE_TEXT.auction.intro}</p>
    </section>
  )
}
