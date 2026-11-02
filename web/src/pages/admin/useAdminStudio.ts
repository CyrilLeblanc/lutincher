// Controller hook of the studio tab (A1): loads the parts manifest, runs the
// live preview on every state change and exposes typed actions. The pending
// and error states of the preview are DERIVED during render from the spec
// snapshot of the last answer, and a monotonically increasing request id
// drops stale answers. Every request goes through the typed REST client;
// ApiError codes map to French messages through strings.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_PATHS, get, post } from '../../api/http'
import type {
  CreatedLutin,
  LutinLayers,
  LutinPreview,
  LutinSlot,
  PartsManifest,
  SlotId,
} from '../../socket/contract'
import { messageForError } from '../../ui/strings'
import {
  assetsForTier,
  buildPreviewSpec,
  buildSaveSpec,
  buildSteppers,
  displayName,
  pinDisplayed,
  pruneSelectionToTier,
  randomSeed,
  stepAssetId,
  type RarityChoice,
  type StudioSpec,
  type StepperView,
} from './studioLogic'

export interface UseAdminStudioOptions {
  /** Called after a lutin is saved (the parent refreshes the inventory). */
  onCreated: () => void
}

/** Last preview answer, tagged with the spec it answers. */
interface AppliedPreview {
  spec: StudioSpec
  preview: LutinPreview
}

/** Last preview failure, tagged with the spec it failed on. */
interface FailedPreview {
  spec: StudioSpec
  message: string
}

export interface UseAdminStudioResult {
  // Parts manifest (GET /api/admin/lutins/parts)
  slots: LutinSlot[] | null
  partsError: string | null
  reloadParts: () => void
  // Live preview (POST /api/admin/lutins/preview)
  preview: LutinPreview | null
  previewPending: boolean
  previewError: string | null
  // Studio state
  rarity: RarityChoice
  nameValue: string
  steppers: StepperView[]
  setRarity: (choice: RarityChoice) => void
  stepSlot: (slot: SlotId, delta: 1 | -1) => void
  rerollAll: () => void
  rerollName: () => void
  setName: (name: string) => void
  // Save (POST /api/admin/lutins)
  savePending: boolean
  saveError: string | null
  savedName: string | null
  save: () => void
}

export function useAdminStudio(options: UseAdminStudioOptions): UseAdminStudioResult {
  const [slots, setSlots] = useState<LutinSlot[] | null>(null)
  const [partsError, setPartsError] = useState<string | null>(null)
  const [seed, setSeed] = useState<number>(() => randomSeed())
  const [rarity, setRarity] = useState<RarityChoice>('auto')
  const [selection, setSelection] = useState<LutinLayers>({})
  const [manualName, setManualName] = useState('')
  const [applied, setApplied] = useState<AppliedPreview | null>(null)
  const [failed, setFailed] = useState<FailedPreview | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)
  // Monotonic id of the latest preview request: stale answers are dropped.
  const previewRequestRef = useRef(0)

  // --- Parts manifest ---------------------------------------------------------

  const loadParts = useCallback((): void => {
    get<PartsManifest>(API_PATHS.adminLutinsParts)
      .then((manifest) => {
        setSlots(manifest.slots)
        setPartsError(null)
      })
      .catch((cause: unknown) => {
        setPartsError(messageForError(cause))
      })
  }, [])

  // Retry from the error UI: resets the state synchronously in the event
  // handler (not in an effect), then reloads.
  const reloadParts = useCallback((): void => {
    setSlots(null)
    setPartsError(null)
    loadParts()
  }, [loadParts])

  useEffect(() => {
    loadParts()
  }, [loadParts])

  // --- Live preview: re-run on every spec change --------------------------------

  const spec = useMemo(() => buildPreviewSpec(seed, rarity, selection), [seed, rarity, selection])

  useEffect(() => {
    previewRequestRef.current += 1
    const request = previewRequestRef.current
    post<LutinPreview>(API_PATHS.adminLutinsPreview, spec)
      .then((result) => {
        if (previewRequestRef.current !== request) return
        setApplied({ spec, preview: result })
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (previewRequestRef.current !== request) return
        setFailed({ spec, message: messageForError(cause) })
      })
  }, [spec])

  const preview = applied?.preview ?? null
  // Pending = no answer yet for the current inputs (also covers the very
  // first load); error = failure of the current inputs.
  const previewPending = applied === null || applied.spec !== spec
  const previewError = failed !== null && failed.spec === spec ? failed.message : null

  // --- Actions -------------------------------------------------------------------

  const applyRarity = useCallback(
    (choice: RarityChoice): void => {
      // A lower tier may forbid some pinned assets: drop them, the server
      // re-rolls those slots (final validation stays server-side).
      setSelection((current) =>
        slots !== null ? pruneSelectionToTier(current, slots, choice) : current,
      )
      setRarity(choice)
    },
    [slots],
  )

  const stepSlot = useCallback(
    (slot: SlotId, delta: 1 | -1): void => {
      if (slots === null) return
      const full = slots.find((candidate) => candidate.id === slot)
      if (full === undefined) return
      const next = stepAssetId(
        assetsForTier(full.assets, rarity),
        selection[slot] ?? preview?.manifest[slot] ?? undefined,
        delta,
      )
      if (next === null) return
      setSelection((current) => {
        const updated: LutinLayers = { ...current }
        updated[slot] = next
        return updated
      })
    },
    [slots, rarity, selection, preview],
  )

  // "Reroll tout": fresh seed, overrides reset (rarity kept).
  const rerollAll = useCallback((): void => {
    setSeed(randomSeed())
    setSelection({})
    setManualName('')
  }, [])

  // "Autre nom": fresh seed with every displayed layer pinned, so only the
  // server-generated name changes.
  const rerollName = useCallback((): void => {
    if (slots === null) return
    setSelection((current) => pinDisplayed(current, preview, slots, rarity))
    setSeed(randomSeed())
    setManualName('')
  }, [slots, preview, rarity])

  const setName = useCallback((name: string): void => {
    setManualName(name)
    setSavedName(null)
  }, [])

  const save = useCallback((): void => {
    if (savePending || preview === null) return
    setSavePending(true)
    setSaveError(null)
    setSavedName(null)
    post<CreatedLutin>(API_PATHS.adminLutins, buildSaveSpec(seed, rarity, selection, manualName))
      .then(() => {
        setSavedName(displayName(manualName, preview))
        options.onCreated()
      })
      .catch((cause: unknown) => {
        setSaveError(messageForError(cause))
      })
      .finally(() => {
        setSavePending(false)
      })
  }, [savePending, preview, seed, rarity, selection, manualName, options])

  const steppers = useMemo(
    () => (slots !== null ? buildSteppers(slots, rarity, selection, preview) : []),
    [slots, rarity, selection, preview],
  )

  return {
    slots,
    partsError,
    reloadParts,
    preview,
    previewPending,
    previewError,
    rarity,
    nameValue: displayName(manualName, preview),
    steppers,
    setRarity: applyRarity,
    stepSlot,
    rerollAll,
    rerollName,
    setName,
    savePending,
    saveError,
    savedName,
    save,
  }
}
