// React binding of AuctionSocketClient: one client per token lifetime.
// Pages subscribe through `onEvent` and send through `send`; the connection
// state is derived during render (token without a status yet = connecting).

import { useCallback, useEffect, useRef, useState } from 'react'
import { readToken } from '../api/http'
import { AuctionSocketClient, type SocketStatus } from './auctionSocket'
import type { ClientMessage, ServerEvent } from './contract'

export type { SocketStatus }

/** Build the /ws URL for a token, same origin as the served front. */
export function buildWebSocketUrl(
  token: string,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`
}

export interface UseAuctionSocketOptions {
  /** JWT; null or empty keeps the socket idle. Defaults to the stored token. */
  token?: string | null
  onEvent?: (event: ServerEvent) => void
}

export interface UseAuctionSocketResult {
  /** Connection state; null while idle (no token). */
  status: SocketStatus | null
  /** Highest journal seq received so far (kept in memory, reset on logout). */
  lastSeq: number
  /** Typed send; false when the socket is not open. */
  send: (message: ClientMessage) => boolean
}

/** Latest state reported by the client of the given token. */
interface SocketSnapshot {
  token: string
  status: SocketStatus | null
  lastSeq: number
}

export function useAuctionSocket(options: UseAuctionSocketOptions = {}): UseAuctionSocketResult {
  // Read localStorage once per mount: renders stay pure.
  const [storedToken] = useState<string | null>(() => readToken())
  const token = options.token !== undefined ? options.token : storedToken

  const [snapshot, setSnapshot] = useState<SocketSnapshot | null>(null)
  const clientRef = useRef<AuctionSocketClient | null>(null)

  // Keep the latest callback without tearing the connection down.
  const onEventRef = useRef(options.onEvent)
  useEffect(() => {
    onEventRef.current = options.onEvent
  }, [options.onEvent])

  useEffect(() => {
    if (token === null || token === '') return
    // Snapshot updates always target the current token; a stale snapshot from
    // a previous token is replaced by a fresh base.
    const applyForToken = (mutate: (base: SocketSnapshot) => SocketSnapshot): void => {
      setSnapshot((prev) => {
        const base: SocketSnapshot =
          prev !== null && prev.token === token ? prev : { token, status: null, lastSeq: 0 }
        return mutate(base)
      })
    }
    const client = new AuctionSocketClient({
      url: () => buildWebSocketUrl(token),
      onStatus: (status) => applyForToken((base) => ({ ...base, status })),
      onEvent: (event) => {
        applyForToken((base) => ({ ...base, lastSeq: Math.max(base.lastSeq, event.seq) }))
        onEventRef.current?.(event)
      },
    })
    clientRef.current = client
    client.start()
    return () => {
      clientRef.current = null
      client.stop()
    }
  }, [token])

  const send = useCallback(
    (message: ClientMessage): boolean => clientRef.current?.send(message) ?? false,
    [],
  )

  if (token === null || token === '') return { status: null, lastSeq: 0, send }
  // A token without a reported status yet is a socket still connecting.
  if (snapshot === null || snapshot.token !== token) return { status: 'connecting', lastSeq: 0, send }
  return { status: snapshot.status ?? 'connecting', lastSeq: snapshot.lastSeq, send }
}
