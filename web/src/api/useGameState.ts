// Persistent game-closed state (cahier §3.4): GET /api/game covers a page
// loaded after the closure (the in-memory `game_closed` event is gone);
// the WebSocket event remains the live path. Errors keep the banner hidden —
// the live pages already surface their own failures.

import { useEffect, useState } from 'react'
import { useSocket } from '../socket/SocketContext'
import type { GameState } from '../socket/contract'
import { API_PATHS, get } from './http'

export function useGameClosed(): boolean {
  const [closed, setClosed] = useState(false)
  const { subscribe } = useSocket()

  useEffect(() => {
    let cancelled = false
    get<GameState>(API_PATHS.game)
      .then((state) => {
        if (!cancelled) setClosed(state.closed)
      })
      .catch(() => {
        // Unreachable API: leave the banner hidden.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'game_closed') setClosed(true)
      }),
    [subscribe],
  )

  return closed
}
