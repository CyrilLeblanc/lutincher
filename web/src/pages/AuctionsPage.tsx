// Home page (/): open and upcoming auctions with live countdowns. REST
// snapshot from GET /api/auctions, then WS differentials (auction_started /
// bid / auction_ended) folded by the pure reducer.

import '../styles/live.css'
import { API_PATHS, get } from '../api/http'
import { LoadState } from '../components/LoadState'
import type { AuctionView, AuctionsSnapshot } from '../socket/contract'
import { AUCTIONS_TEXT, PAGE_TEXT, messageForError } from '../ui/strings'
import { AuctionCard } from './auction/AuctionCard'
import {
  EMPTY_AUCTIONS,
  auctionsReducer,
  initAuctions,
  openEntries,
  scheduledEntries,
  type AuctionEntry,
  type AuctionsState,
} from './auction/reducer'
import { useNow } from './auction/useNow'
import { useLiveSnapshot } from './useLiveSnapshot'

export function AuctionsPage() {
  const live = useLiveSnapshot<AuctionsState, AuctionView[]>({
    key: 'auctions',
    initial: EMPTY_AUCTIONS,
    fetchSnapshot: () => get<AuctionsSnapshot>(API_PATHS.auctions).then((s) => s.auctions),
    fromSnapshot: initAuctions,
    applyEvent: auctionsReducer,
    failureMessage: messageForError,
  })
  const now = useNow()
  const open = openEntries(live.state)
  const scheduled = scheduledEntries(live.state)

  return (
    <section className="page">
      <h1>{PAGE_TEXT.auctions.title}</h1>
      <p className="page-intro">{PAGE_TEXT.auctions.intro}</p>
      <LoadState phase={live.phase} message={live.message} onRetry={live.retry} />
      {live.phase === 'ready' && (
        <>
          <section className="auctions-section">
            <h2>{AUCTIONS_TEXT.openSection}</h2>
            <AuctionGrid entries={open} now={now} emptyText={AUCTIONS_TEXT.emptyOpen} />
          </section>
          <section className="auctions-section">
            <h2>{AUCTIONS_TEXT.scheduledSection}</h2>
            <AuctionGrid entries={scheduled} now={now} emptyText={AUCTIONS_TEXT.emptyScheduled} />
          </section>
        </>
      )}
    </section>
  )
}

function AuctionGrid({
  entries,
  now,
  emptyText,
}: {
  entries: readonly AuctionEntry[]
  now: number
  emptyText: string
}) {
  if (entries.length === 0) return <p className="empty-note">{emptyText}</p>
  return (
    <div className="auctions-grid">
      {entries.map((entry) => (
        <AuctionCard key={entry.view.id} entry={entry} now={now} />
      ))}
    </div>
  )
}
