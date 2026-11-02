// Controller hook of the sales tab (A2–A4): schedule form state and
// submission (POST /api/admin/auctions), auctions list (GET /api/auctions)
// and game closure (POST /api/admin/game/close). The WS `game_closed` event
// is a second source for the closed state (another admin may close, or the
// answer may arrive through the socket first).

import { useCallback, useEffect, useState } from 'react'
import { API_PATHS, get, post } from '../../api/http'
import { useSocket } from '../../socket/SocketContext'
import type {
  AuctionView,
  AuctionsSnapshot,
  LeaderboardRow,
  Lutin,
} from '../../socket/contract'
import { messageForError } from '../../ui/strings'
import {
  buildCreateAuctionRequest,
  EMPTY_SALES_FORM,
  hasSalesErrors,
  validateSalesForm,
  type GameClosedResult,
  type SalesErrors,
  type SalesForm,
} from './salesLogic'

export interface UseAdminSalesOptions {
  /** Inventory lutins — used to name the lutin in the confirmation message. */
  lutins: readonly Lutin[] | null
}

export interface UseAdminSalesResult {
  // Schedule form (A2)
  form: SalesForm
  errors: SalesErrors
  updateForm: (patch: Partial<SalesForm>) => void
  submitPending: boolean
  submitError: string | null
  /** Name of the lutin of the last scheduled sale ('' when unknown). */
  scheduledName: string | null
  submit: () => void
  // Auctions list (GET /api/auctions: scheduled + open)
  auctions: AuctionView[] | null
  auctionsError: string | null
  reloadAuctions: () => void
  // Game closure (A4)
  gameClosed: boolean
  podium: LeaderboardRow[] | null
  closePending: boolean
  closeError: string | null
  closeGame: () => void
}

export function useAdminSales(options: UseAdminSalesOptions): UseAdminSalesResult {
  const [form, setForm] = useState<SalesForm>(EMPTY_SALES_FORM)
  const [errors, setErrors] = useState<SalesErrors>({})
  const [submitPending, setSubmitPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [scheduledName, setScheduledName] = useState<string | null>(null)
  const [auctions, setAuctions] = useState<AuctionView[] | null>(null)
  const [auctionsError, setAuctionsError] = useState<string | null>(null)
  const [gameClosed, setGameClosed] = useState(false)
  const [podium, setPodium] = useState<LeaderboardRow[] | null>(null)
  const [closePending, setClosePending] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const reloadAuctions = useCallback((): void => {
    get<AuctionsSnapshot>(API_PATHS.auctions)
      .then((snapshot) => {
        setAuctions(snapshot.auctions)
        setAuctionsError(null)
      })
      .catch((cause: unknown) => {
        setAuctionsError(messageForError(cause))
      })
  }, [])

  useEffect(() => {
    reloadAuctions()
  }, [reloadAuctions])

  const updateForm = useCallback((patch: Partial<SalesForm>): void => {
    setForm((current) => ({ ...current, ...patch }))
    setScheduledName(null)
  }, [])

  const submit = useCallback((): void => {
    if (gameClosed || submitPending) return
    const validation = validateSalesForm(form)
    setErrors(validation)
    setSubmitError(null)
    setScheduledName(null)
    if (hasSalesErrors(validation)) return
    setSubmitPending(true)
    post<unknown>(API_PATHS.adminAuctions, buildCreateAuctionRequest(form, new Date()))
      .then(() => {
        const lutin = options.lutins?.find((candidate) => candidate.id === form.lutinId)
        setScheduledName(lutin?.name ?? '')
        setForm(EMPTY_SALES_FORM)
        setErrors({})
        reloadAuctions()
      })
      .catch((cause: unknown) => {
        setSubmitError(messageForError(cause))
      })
      .finally(() => {
        setSubmitPending(false)
      })
  }, [gameClosed, submitPending, form, options.lutins, reloadAuctions])

  const closeGame = useCallback((): void => {
    if (closePending) return
    setClosePending(true)
    setCloseError(null)
    post<GameClosedResult>(API_PATHS.adminGameClose)
      .then((result) => {
        setPodium(result.podium)
        setGameClosed(true)
      })
      .catch((cause: unknown) => {
        setCloseError(messageForError(cause))
      })
      .finally(() => {
        setClosePending(false)
      })
  }, [closePending])

  const { subscribe } = useSocket()
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'game_closed') {
          setGameClosed(true)
          setPodium(event.podium)
        }
      }),
    [subscribe],
  )

  return {
    form,
    errors,
    updateForm,
    submitPending,
    submitError,
    scheduledName,
    submit,
    auctions,
    auctionsError,
    reloadAuctions,
    gameClosed,
    podium,
    closePending,
    closeError,
    closeGame,
  }
}
