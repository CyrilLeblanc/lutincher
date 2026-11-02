// Profile snapshot: fetch /api/me whenever the token changes, null otherwise.
// Errors (network, unauthorized) collapse to null — the balance stays hidden.
// The value is derived during render (React-recommended fetch pattern): while
// the request for the current token is in flight, the profile is null.

import { useEffect, useState } from 'react'
import type { UserMe } from '../socket/contract'
import { API_PATHS, get } from './http'

interface MeSnapshot {
  token: string
  me: UserMe | null
}

export function useMe(token: string | null): UserMe | null {
  const [snapshot, setSnapshot] = useState<MeSnapshot | null>(null)

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    get<UserMe>(API_PATHS.me)
      .then((me) => {
        if (!cancelled) setSnapshot({ token, me })
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ token, me: null })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (token === null) return null
  // Stale snapshot for a previous token: the fetch for this one is pending.
  return snapshot !== null && snapshot.token === token ? snapshot.me : null
}
