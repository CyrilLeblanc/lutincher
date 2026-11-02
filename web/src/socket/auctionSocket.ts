// Framework-free client for the auction WebSocket channel: auto-reconnect
// with exponential backoff + jitter, duplicate filtering by global seq, and
// resync of missed events after a drop. No React here on purpose — the module
// is unit-testable with an injected WebSocket factory and timers.

import { isRecord, type ClientMessage, type ServerEvent } from './contract'

/** Lifecycle of a managed socket connection. */
export type SocketStatus = 'connecting' | 'open' | 'reconnecting'

// Reconnection policy (cahier §6): 1 s → ×2 → 30 s ceiling, ±20% jitter.
export const RECONNECT_BASE_DELAY_MS = 1000
export const RECONNECT_MAX_DELAY_MS = 30000
export const RECONNECT_JITTER_RATIO = 0.2

/** Pure: delay in ms before reconnection attempt `attempt` (0-based). */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS)
  const jitter = 1 + (random() * 2 - 1) * RECONNECT_JITTER_RATIO
  // The 30 s ceiling is hard: even jittered, a delay never exceeds it.
  return Math.min(RECONNECT_MAX_DELAY_MS, Math.round(exponential * jitter))
}

const SERVER_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  'auction_started',
  'bid',
  'auction_ended',
  'outbid',
  'presence',
  'leaderboard',
  'game_closed',
  'sync',
  'error',
])

/**
 * Parse and shallow-validate a server frame (discriminant `type` + `seq`).
 * Returns null on malformed input — the server stays authoritative, we drop.
 */
export function parseServerEvent(data: string): ServerEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (typeof parsed.type !== 'string' || !SERVER_EVENT_TYPES.has(parsed.type)) return null
  if (typeof parsed.seq !== 'number' || !Number.isFinite(parsed.seq)) return null
  return parsed as ServerEvent
}

/** Timer handle as returned by the DOM setTimeout. */
export type TimerHandle = ReturnType<typeof setTimeout>

export interface AuctionSocketOptions {
  /** WebSocket URL; null while there is nothing to connect to (no token). */
  url: () => string | null
  /** Receives every event in journal order, duplicates already filtered. */
  onEvent: (event: ServerEvent) => void
  onStatus?: (status: SocketStatus) => void
  /** Injectable seams for tests (socket factory, timers, jitter source). */
  createSocket?: (url: string) => WebSocket
  schedule?: (handler: () => void, delayMs: number) => TimerHandle
  cancelSchedule?: (handle: TimerHandle) => void
  random?: () => number
}

export class AuctionSocketClient {
  private readonly options: AuctionSocketOptions
  private readonly openSocket: (url: string) => WebSocket
  private readonly schedule: (handler: () => void, delayMs: number) => TimerHandle
  private readonly cancelSchedule: (handle: TimerHandle) => void
  private readonly random: () => number

  private socket: WebSocket | null = null
  private reconnectTimer: TimerHandle | null = null
  private attempts = 0
  private running = false
  private lastSeq = 0
  private status: SocketStatus = 'connecting'

  constructor(options: AuctionSocketOptions) {
    this.options = options
    this.openSocket = options.createSocket ?? ((url) => new WebSocket(url))
    this.schedule = options.schedule ?? ((handler, delayMs) => setTimeout(handler, delayMs))
    this.cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle))
    this.random = options.random ?? Math.random
  }

  getLastSeq(): number {
    return this.lastSeq
  }

  getStatus(): SocketStatus {
    return this.status
  }

  /** Start the connect/reconnect loop. Idempotent. */
  start(): void {
    if (this.running) return
    this.running = true
    this.attempts = 0
    this.connect('connecting')
  }

  /** Stop and forget: closes the socket and never reconnects. */
  stop(): void {
    this.running = false
    this.clearReconnectTimer()
    if (this.socket !== null) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
  }

  /** Send a typed message; false when the socket is not open. */
  send(message: ClientMessage): boolean {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private connect(nextStatus: SocketStatus): void {
    const url = this.options.url()
    if (url === null) return
    this.setStatus(nextStatus)
    const socket = this.openSocket(url)
    this.socket = socket
    socket.onopen = () => this.handleOpen()
    socket.onmessage = (event: MessageEvent) => this.handleMessage(event)
    socket.onclose = () => this.handleClose()
    socket.onerror = () => {
      // The browser always fires onclose right after onerror.
    }
  }

  private handleOpen(): void {
    this.attempts = 0
    this.setStatus('open')
    // Resync only after a drop: on a fresh session the REST snapshots are the
    // initial state and the socket streams differentials from now on.
    if (this.lastSeq > 0) {
      this.send({ type: 'sync', last_seq: this.lastSeq })
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return
    const parsed = parseServerEvent(event.data)
    if (parsed === null) return
    this.dispatch(parsed)
  }

  /** Deliver in journal order, filtering duplicates (seq is globally monotonic). */
  private dispatch(event: ServerEvent): void {
    if (event.seq <= this.lastSeq) return
    if (event.type === 'sync') {
      // Replay the missed events first: each is seq-filtered again, then the
      // sync envelope itself closes the catch-up.
      for (const inner of event.events) {
        this.dispatch(inner)
      }
    }
    this.lastSeq = Math.max(this.lastSeq, event.seq)
    this.options.onEvent(event)
  }

  private handleClose(): void {
    this.socket = null
    if (!this.running) return
    this.setStatus('reconnecting')
    const delayMs = backoffDelayMs(this.attempts, this.random)
    this.attempts += 1
    this.reconnectTimer = this.schedule(() => {
      this.reconnectTimer = null
      this.connect('reconnecting')
    }, delayMs)
  }

  private setStatus(status: SocketStatus): void {
    this.status = status
    this.options.onStatus?.(status)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return
    this.cancelSchedule(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
