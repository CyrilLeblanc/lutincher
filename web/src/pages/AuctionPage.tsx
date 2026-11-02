// Auction room page (/vente/:id): validates the route param, then delegates
// to the room component so every hook stays unconditional.

import { useParams } from 'react-router-dom'
import type { Id } from '../socket/contract'
import { PAGE_TEXT } from '../ui/strings'
import { AuctionRoom } from './auction/AuctionRoom'

export function AuctionPage() {
  const { id } = useParams()
  if (id === undefined) {
    return (
      <section className="page">
        <h1>{PAGE_TEXT.notFound.title}</h1>
        <p className="page-intro">{PAGE_TEXT.notFound.intro}</p>
      </section>
    )
  }
  const roomId: Id = id
  return <AuctionRoom roomId={roomId} />
}
