// Live-snapshot glue shared by the auction and leaderboard pages: REST builds
// the initial state, the WebSocket streams differentials on top.
//
// Race handling: events arriving while the snapshot request is in flight are
// buffered, then folded (in arrival order) onto the snapshot base — nothing
// received between page load and snapshot resolution is lost. Pure folding
// (fromSnapshot / applyEvent) is injected, so the domain logic stays in
// framework-free modules.
//
// State layout: one "slot" tagged with its fetch token (key + attempt). A
// token change derives the loading view during render (no synchronous
// setState in an effect); only async completions mutate the slot.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket } from '../socket/SocketContext'
import type { ServerEvent } from '../socket/contract'

export type LivePhase = 'loading' | 'ready' | 'failed'

export interface UseLiveSnapshotOptions<T, S> {
  /** The snapshot is (re)fetched whenever this key changes (e.g. room id). */
  key: string
  /** Live state before the snapshot lands; no event is applied to it. */
  initial: T
  /** Performs the REST snapshot request. */
  fetchSnapshot: () => Promise<S>
  /** Builds the live base from the REST snapshot (pure). */
  fromSnapshot: (snapshot: S, now: number) => T
  /** Folds one server event into the live state (pure). */
  applyEvent: (state: T, event: ServerEvent, now: number) => T
  /** French message for a failed snapshot. */
  failureMessage: (cause: unknown) => string
}

export interface LiveSnapshot<T> {
  phase: LivePhase
  /** French failure message; null outside the failed phase. */
  message: string | null
  state: T
  /** Triggers a new snapshot attempt (keeps the live events flowing). */
  retry: () => void
}

interface Slot<T> {
  /** Fetch token this slot belongs to; mismatch = stale, derive loading. */
  token: string
  phase: LivePhase
  message: string | null
  state: T
}

export function useLiveSnapshot<T, S>(options: UseLiveSnapshotOptions<T, S>): LiveSnapshot<T> {
  const { subscribe } = useSocket()
  const [attempt, setAttempt] = useState(0)
  const token = `${options.key}#${attempt}`
  const [slot, setSlot] = useState<Slot<T>>({
    token,
    phase: 'loading',
    message: null,
    state: options.initial,
  })

  // Latest options without tearing the subscription or refetching.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  // Buffered events + snapshot flag, stable across renders.
  const bufferedRef = useRef<ServerEvent[]>([])
  const snapshottedRef = useRef(false)

  // Snapshot fetch (runs on key change and on retry).
  useEffect(() => {
    bufferedRef.current = []
    snapshottedRef.current = false
    let cancelled = false
    optionsRef.current
      .fetchSnapshot()
      .then((snapshot) => {
        if (cancelled) return
        const base = optionsRef.current.fromSnapshot(snapshot, Date.now())
        const folded = bufferedRef.current.reduce(
          (acc, event) => optionsRef.current.applyEvent(acc, event, Date.now()),
          base,
        )
        bufferedRef.current = []
        snapshottedRef.current = true
        setSlot({ token, phase: 'ready', message: null, state: folded })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setSlot({
          token,
          phase: 'failed',
          message: optionsRef.current.failureMessage(cause),
          state: optionsRef.current.initial,
        })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // Live events: buffered until the snapshot lands, then applied. Events for
  // a stale token mutate a slot the render below already ignores.
  useEffect(
    () =>
      subscribe((event) => {
        if (!snapshottedRef.current) {
          bufferedRef.current.push(event)
          return
        }
        setSlot((previous) =>
          previous.phase === 'ready'
            ? {
                ...previous,
                state: optionsRef.current.applyEvent(previous.state, event, Date.now()),
              }
            : previous,
        )
      }),
    [subscribe],
  )

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  // Stale token (key changed or retry in flight): derive the loading view.
  if (slot.token !== token) {
    return { phase: 'loading', message: null, state: options.initial, retry }
  }
  return { phase: slot.phase, message: slot.message, state: slot.state, retry }
}
