// Socket provider: the single app-wide auction socket. The token comes from
// the auth context — useAuctionSocket tears the connection down and rebuilds
// it on each token change, staying idle while logged out. Server events fan
// out to the subscribers registered through the context value.

import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAuctionSocket } from './useAuctionSocket'
import { socketContext, type SocketState } from './SocketContext'
import type { ServerEvent } from './contract'

type EventListener = (event: ServerEvent) => void

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()

  // Listener set kept in a ref: subscribing/unsubscribing never re-renders
  // and never tears the connection down.
  const listenersRef = useRef<Set<EventListener>>(new Set())

  const onEvent = useCallback((event: ServerEvent): void => {
    // Snapshot: a listener may unsubscribe during the dispatch.
    for (const listener of [...listenersRef.current]) listener(event)
  }, [])

  const { status, send } = useAuctionSocket({ token, onEvent })

  const subscribe = useCallback((listener: EventListener): (() => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const value = useMemo<SocketState>(
    () => ({ status, send, subscribe }),
    [status, send, subscribe],
  )

  return <socketContext.Provider value={value}>{children}</socketContext.Provider>
}
