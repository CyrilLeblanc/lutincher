// Player collection (J5): the lutins won at auction, served by
// GET /api/me/collection — card grid plus the total collection value
// (cahier §3.4: the victory criterion). No live updates: a settled sale is
// final, a reload after the `auction_ended` event is enough.

import { useCallback, useEffect, useState } from 'react'
import '../styles/live.css'
import { API_PATHS, get } from '../api/http'
import { useAuth } from '../auth/AuthContext'
import { LutinCard } from '../components/LutinCard'
import type { CollectionLutin, CollectionSnapshot } from '../socket/contract'
import { COLLECTION_TEXT, LOAD_STATE_TEXT, PAGE_TEXT, messageForError } from '../ui/strings'

export function CollectionPage() {
  const { user } = useAuth()
  const [lutins, setLutins] = useState<CollectionLutin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    get<CollectionSnapshot>(API_PATHS.meCollection)
      .then((snapshot) => {
        setLutins(snapshot.lutins)
        setError(null)
      })
      .catch((cause: unknown) => {
        setError(messageForError(cause))
      })
  }, [])

  useEffect(() => {
    if (user !== null) reload()
  }, [user, reload])

  if (user === null) {
    return (
      <section className="page">
        <h1>{PAGE_TEXT.collection.title}</h1>
        <p className="page-intro">{PAGE_TEXT.collection.intro}</p>
        <p className="empty-note">{COLLECTION_TEXT.loginRequired}</p>
      </section>
    )
  }

  const total = (lutins ?? []).reduce((sum, lutin) => sum + lutin.value, 0)

  return (
    <section className="page">
      <h1>{PAGE_TEXT.collection.title}</h1>
      <p className="page-intro">{PAGE_TEXT.collection.intro}</p>
      {error !== null ? (
        <div className="load-state load-state--failed">
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="button" className="button button--ghost" onClick={reload}>
            {LOAD_STATE_TEXT.retry}
          </button>
        </div>
      ) : lutins === null ? (
        <p className="load-state">{LOAD_STATE_TEXT.loading}</p>
      ) : lutins.length === 0 ? (
        <p className="empty-note">{COLLECTION_TEXT.empty}</p>
      ) : (
        <>
          <p className="collection-total">{COLLECTION_TEXT.total(total)}</p>
          <div className="auctions-grid">
            {lutins.map((lutin) => (
              <LutinCard key={lutin.id} lutin={lutin} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
