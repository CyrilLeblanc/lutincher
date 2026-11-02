// Socket context: the app-wide socket contract. The provider lives in
// SocketProvider.tsx (fast-refresh keeps components and hooks in separate
// files) and builds ONE socket instance for the whole app from the auth
// token — idle while logged out, reconnected on login/logout. Pages
// (web-enchères, web-studio) consume it through useSocket: `subscribe`
// registers a listener receiving every ServerEvent in journal order and
// returns its unsubscribe function; `send` posts typed client messages.

import { createContext, useContext } from 'react'
import type { SocketStatus } from './useAuctionSocket'
import type { ClientMessage, ServerEvent } from './contract'

export interface SocketState {
  /** Connection state; null while idle (no token). */
  status: SocketStatus | null
  /** Typed send; false when the socket is not open. */
  send: (message: ClientMessage) => boolean
  /** Registers an event listener; returns its unsubscribe function. */
  subscribe: (listener: (event: ServerEvent) => void) => () => void
}

const MISSING_PROVIDER = 'useSocket requires <SocketProvider> above in the tree'

export const socketContext = createContext<SocketState | null>(null)

export function useSocket(): SocketState {
  const value = useContext(socketContext)
  if (value === null) throw new Error(MISSING_PROVIDER)
  return value
}
