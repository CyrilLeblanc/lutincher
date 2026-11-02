// Pure logic of the lutin studio (A1): rarity tiers and ranks, per-tier asset
// filtering, stepper cycling, layer pinning and the preview/save specs.
// No React, no fetch — every helper is deterministic except randomSeed
// (injectable RNG), so the module is testable on its own.

import type {
  LutinAsset,
  LutinLayers,
  LutinPreview,
  LutinSlot,
  LutinSpecRequest,
  Rarity,
  SlotId,
} from '../../socket/contract'

/** Rarity tiers from lowest to highest (cahier §3.2). */
export const RARITY_TIERS: readonly Rarity[] = ['commun', 'rare', 'epique', 'legendaire']

/** Numeric rank of each tier — assets are capped by the rolled tier. */
export const RARITY_RANK: Record<Rarity, number> = {
  commun: 0,
  rare: 1,
  epique: 2,
  legendaire: 3,
}

/** Rarity selector choice: 'auto' lets the server roll 60/30/9/1. */
export type RarityChoice = 'auto' | Rarity

/**
 * Studio spec = LutinSpecRequest + the manual name. The extra field is a
 * contract complement (task E): the server keeps its generated name when
 * `name` is absent.
 */
export interface StudioSpec extends LutinSpecRequest {
  /** Manual name typed by the admin; the server keeps its own when absent. */
  name?: string
}

/** Parses a select value into a rarity choice; null when unknown. */
export function parseRarityChoice(raw: string): RarityChoice | null {
  if (raw === 'auto') return 'auto'
  const tier = RARITY_TIERS.find((candidate) => candidate === raw)
  return tier !== undefined ? tier : null
}

/** Assets of a slot capped at the forced tier; all of them in auto mode. */
export function assetsForTier(
  assets: readonly LutinAsset[],
  choice: RarityChoice,
): LutinAsset[] {
  if (choice === 'auto') return [...assets]
  const max = RARITY_RANK[choice]
  return assets.filter((asset) => RARITY_RANK[asset.rarity] <= max)
}

/** Id of the asset one step away (wraps around); null when the list is empty. */
export function stepAssetId(
  assets: readonly LutinAsset[],
  currentId: string | undefined,
  delta: 1 | -1,
): string | null {
  if (assets.length === 0) return null
  const index = assets.findIndex((asset) => asset.id === currentId)
  const base = index === -1 ? 0 : index
  return assets[(base + delta + assets.length) % assets.length].id
}

/** Layer actually shown: the pinned override, else the preview's choice. */
export function displayedAssetId(
  selection: LutinLayers,
  preview: LutinPreview | null,
  slot: SlotId,
): string | undefined {
  const pinned = selection[slot]
  if (pinned !== undefined) return pinned
  return preview?.manifest[slot] ?? undefined
}

/** Drops the pins a lower tier would forbid; the server re-rolls those slots. */
export function pruneSelectionToTier(
  selection: LutinLayers,
  slots: readonly LutinSlot[],
  choice: RarityChoice,
): LutinLayers {
  if (choice === 'auto') return { ...selection }
  const max = RARITY_RANK[choice]
  const kept: LutinLayers = {}
  for (const slot of slots) {
    const pinned = selection[slot.id]
    const asset = slot.assets.find((candidate) => candidate.id === pinned)
    if (pinned !== undefined && asset !== undefined && RARITY_RANK[asset.rarity] <= max) {
      kept[slot.id] = pinned
    }
  }
  return kept
}

/**
 * Pins every displayed layer (capped at the tier) so that a fresh seed only
 * changes the generated name ("Autre nom").
 */
export function pinDisplayed(
  selection: LutinLayers,
  preview: LutinPreview | null,
  slots: readonly LutinSlot[],
  choice: RarityChoice,
): LutinLayers {
  const displayed: LutinLayers = preview !== null ? { ...preview.manifest, ...selection } : { ...selection }
  return pruneSelectionToTier(displayed, slots, choice)
}

/** 31-bit random seed for the reroll buttons (injectable RNG). */
export function randomSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 2 ** 31)
}

function layerOverrides(selection: LutinLayers): LutinLayers | undefined {
  return Object.keys(selection).length > 0 ? selection : undefined
}

/** Spec of the live preview — no manual name: the server's name is displayed. */
export function buildPreviewSpec(
  seed: number,
  rarity: RarityChoice,
  selection: LutinLayers,
): StudioSpec {
  return {
    seed,
    rarity: rarity === 'auto' ? undefined : rarity,
    overrides: layerOverrides(selection),
  }
}

/** Spec of the save call — same lutin as the preview, plus the manual name. */
export function buildSaveSpec(
  seed: number,
  rarity: RarityChoice,
  selection: LutinLayers,
  manualName: string,
): StudioSpec {
  return {
    ...buildPreviewSpec(seed, rarity, selection),
    name: manualName !== '' ? manualName : undefined,
  }
}

/** Name shown in the editable field: the manual one, else the server's. */
export function displayName(manualName: string, preview: LutinPreview | null): string {
  return manualName !== '' ? manualName : (preview?.name ?? '')
}

/** One row of the "retained layers" list of the preview panel. */
export interface ManifestRow {
  slotId: SlotId
  slotLabel: string
  assetLabel: string
}

/** Human-readable rows of a preview manifest, in slot stacking order. */
export function manifestRows(
  preview: LutinPreview,
  slots: readonly LutinSlot[] | null,
): ManifestRow[] {
  const rows: ManifestRow[] = []
  for (const slot of slots ?? []) {
    const assetId = preview.manifest[slot.id]
    if (assetId === undefined) continue
    const asset = slot.assets.find((candidate) => candidate.id === assetId)
    rows.push({ slotId: slot.id, slotLabel: slot.label, assetLabel: asset?.label ?? assetId })
  }
  return rows
}

/** View model of one slot row, composed by the hook, rendered by SlotStepper. */
export interface StepperView {
  slot: LutinSlot
  /** Assets of the slot capped at the forced tier (all of them in auto). */
  assets: LutinAsset[]
  /** Asset currently displayed (pin if any, else the preview's choice). */
  currentId: string | undefined
}

/** Builds every stepper row of the studio for the current state. */
export function buildSteppers(
  slots: readonly LutinSlot[],
  rarity: RarityChoice,
  selection: LutinLayers,
  preview: LutinPreview | null,
): StepperView[] {
  return slots.map((slot) => ({
    slot,
    assets: assetsForTier(slot.assets, rarity),
    currentId: displayedAssetId(selection, preview, slot.id),
  }))
}

/** SVG string of a preview as a displayable data URI. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
