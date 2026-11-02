// All French UI strings — the single source of user-facing text.
// Nothing else in the codebase should contain display copy.

import { ApiError } from '../api/http'
import type { CredentialErrorCode, CredentialErrors } from '../auth/credentials'
import type { SocketStatus } from '../socket/auctionSocket'
import type { ErrorCode, Rarity } from '../socket/contract'

export const APP_NAME = 'Lutincher'
export const APP_TAGLINE = 'Maison de ventes aux enchères de lutins'

export const NAV_LABELS = {
  main: 'Navigation principale',
  auctions: 'Ventes',
  collection: 'Ma collection',
  leaderboard: 'Classement',
  admin: 'Studio admin',
  login: 'Connexion',
  register: 'Inscription',
} as const

export const SOCKET_STATUS_LABELS: Record<SocketStatus, string> = {
  connecting: 'Connexion…',
  open: 'En direct',
  reconnecting: 'Reconnexion…',
}

export const RARITY_LABELS: Record<Rarity, string> = {
  commun: 'Commun',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
}

export const LAYOUT_TEXT = {
  balance: 'Solde',
  pointsUnit: 'pts',
  logout: 'Déconnexion',
} as const

export const LUTIN_CARD_TEXT = {
  imageAlt: (name: string): string => `Portrait SVG du lutin ${name}`,
  viewLutin: 'Voir la fiche',
} as const

// --- Login / register forms (J1) ----------------------------------------------

export const AUTH_FORM_TEXT = {
  usernameLabel: 'Pseudo',
  usernameHint: 'Entre 3 et 30 caractères.',
  passwordLabel: 'Mot de passe',
  passwordHint: 'Au moins 4 caractères.',
  loginSubmit: 'Se connecter',
  loginPending: 'Connexion en cours…',
  registerSubmit: 'Créer mon compte',
  registerPending: 'Création en cours…',
  toRegister: 'Pas encore de compte ? S’inscrire',
  toLogin: 'Déjà un compte ? Se connecter',
} as const

/** French wording of the client-side form error codes. */
export const CREDENTIAL_ERROR_MESSAGES: Record<CredentialErrorCode, string> = {
  username_required: 'Saisissez un pseudo.',
  password_required: 'Saisissez un mot de passe.',
  username_length: 'Le pseudo doit contenir entre 3 et 30 caractères.',
  password_length: 'Le mot de passe doit contenir au moins 4 caractères.',
}

/** French message of a field error, or null when the field is valid. */
export function credentialErrorMessage(
  errors: CredentialErrors,
  field: 'username' | 'password',
): string | null {
  const code = errors[field]
  return code !== undefined ? CREDENTIAL_ERROR_MESSAGES[code] : null
}

// --- Error codes → French messages ---------------------------------------------

/**
 * French message per error code: the WS contract codes (cahier §5), the
 * REST-specific auth codes (username_taken, invalid_credentials, validation)
 * and the HTTP client codes (not_found, bad_request, network_error…).
 */
export const ERROR_MESSAGES: Record<ErrorCode | string, string> = {
  unauthorized: 'Vous devez être connecté pour effectuer cette action.',
  forbidden: 'Cette action est réservée aux administrateurs.',
  username_taken: 'Ce pseudo est déjà pris.',
  invalid_credentials: 'Pseudo ou mot de passe incorrect.',
  validation: 'Certaines informations sont invalides.',
  not_found: 'Cette page ou cette ressource n’existe pas ou plus.',
  bid_too_low: 'Mise trop basse : elle doit atteindre la mise courante plus le palier minimal.',
  insufficient_funds: 'Points insuffisants pour cette mise.',
  auction_not_open: 'Cette vente n’accepte pas de mise pour le moment.',
  malformed_message: 'Message malformé.',
  message_too_large: 'Message trop volumineux.',
  rate_limited: 'Trop de requêtes : patientez un instant.',
  bad_request: 'Requête invalide.',
  network_error: 'Impossible de joindre le serveur.',
}

/** Generic French fallback when the error code is unknown. */
export const ERROR_FALLBACK_MESSAGE = 'Une erreur inattendue est survenue.'

/** French message for an error code, with the generic fallback. */
export function apiErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_FALLBACK_MESSAGE
}

/** French message for any thrown value (ApiError by code, else fallback). */
export function messageForError(cause: unknown): string {
  return cause instanceof ApiError ? apiErrorMessage(cause.code) : ERROR_FALLBACK_MESSAGE
}

/** Title + intro sentence of every page (stubs today, real pages later). */
export const PAGE_TEXT = {
  auctions: {
    title: 'Ventes aux enchères',
    intro: 'Les ventes en cours et à venir, avec leur chrono en direct.',
  },
  auction: {
    title: 'Salle de vente',
    intro: 'Le lutin, l’historique des mises en direct et le bouton pour surenchérir.',
  },
  lutin: {
    title: 'Fiche lutin',
    intro: 'Portrait, rareté et valeur de collection du lutin.',
  },
  collection: {
    title: 'Ma collection',
    intro: 'Tous les lutins remportés en enchère.',
  },
  leaderboard: {
    title: 'Classement',
    intro: 'Le classement live, par valeur de collection.',
  },
  login: {
    title: 'Connexion',
    intro: 'Pseudo et mot de passe pour rejoindre les enchères.',
  },
  register: {
    title: 'Inscription',
    intro: 'Un pseudo, un mot de passe, et 1000 points offerts.',
  },
  admin: {
    title: 'Studio admin',
    intro: 'Génération des lutins et programmation des ventes.',
  },
  notFound: {
    title: 'Page introuvable',
    intro: 'Cette page n’existe pas ou plus.',
  },
} as const

// --- Admin studio (task H) -----------------------------------------------------
// Block appended by the web-studio task (additions only, at the end of the
// file — the file is co-edited in parallel by other tasks). Imports are
// hoisted, so they may sit here.

import type { AuctionStatus } from '../socket/contract'
import type { SalesErrors, SalesField, SalesFieldError } from '../pages/admin/salesLogic'

/** Tabs and lutin studio wording (A1). */
export const ADMIN_TEXT = {
  tabsLabel: 'Sections de l’espace admin',
  studioTab: 'Concepteur de lutins',
  salesTab: 'Ventes',
  previewTitle: 'Aperçu en direct',
  previewAlt: (name: string): string => `Aperçu SVG du lutin ${name}`,
  previewPending: 'Génération de l’aperçu…',
  nameLabel: 'Nom du lutin',
  manifestTitle: 'Calques retenus',
  seedLabel: (seed: number): string => `Graine ${seed}`,
  designerTitle: 'Composition par calque',
  rarityLabel: 'Rareté du tirage',
  rarityAuto: 'Auto (60 / 30 / 9 / 1)',
  rarityForcedHint: 'Rareté forcée : les calques affichés sont limités au palier choisi.',
  loadingParts: 'Chargement des calques…',
  partsRetry: 'Recharger les calques',
  stepBack: (slot: string): string => `Calque précédent — ${slot}`,
  stepForward: (slot: string): string => `Calque suivant — ${slot}`,
  unknownAsset: '—',
  rerollAll: 'Reroll tout',
  rerollName: 'Autre nom',
  save: 'Enregistrer le lutin',
  savePending: 'Enregistrement…',
  savedLutin: (name: string): string => `« ${name} » a rejoint l’inventaire.`,
} as const

/** French label of an auction status (shared display). */
export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  scheduled: 'Programmée',
  open: 'Ouverte',
  ended: 'Terminée',
  cancelled: 'Annulée',
}

/** Sales tab wording (A2–A4). */
export const SALES_TEXT = {
  scheduleTitle: 'Programmer une vente',
  lutinLabel: 'Lutin à vendre',
  lutinPlaceholder: '— Choisir un lutin —',
  lutinOption: (name: string, rarity: string): string => `${name} — ${rarity}`,
  startPriceLabel: 'Prix de départ',
  incrementLabel: 'Palier minimal',
  durationLabel: 'Durée (secondes)',
  startModeLabel: 'Démarrage',
  startNow: 'Immédiat',
  startInMinutes: 'Dans (minutes) :',
  submit: 'Programmer la vente',
  submitPending: 'Programmation…',
  scheduled: (name: string): string =>
    name !== '' ? `Vente de « ${name} » programmée.` : 'Vente programmée.',
  inventoryLoading: 'Chargement de l’inventaire…',
  inventoryEmpty: 'Inventaire vide : créez d’abord un lutin dans le concepteur.',
  inventoryRetry: 'Recharger l’inventaire',
  loadingAuctions: 'Chargement des ventes…',
  listTitle: 'Ventes à venir et en cours',
  refresh: 'Actualiser',
  emptyAuctions: 'Aucune vente programmée ou en cours.',
  colStatus: 'Statut',
  colLutin: 'Lutin',
  colPrice: 'Prix courant',
  closeTitle: 'Fin de partie',
  closeGame: 'Clôturer la partie',
  closeConfirmTitle: 'Clôturer définitivement la partie ?',
  closeWarning:
    'Plus aucune nouvelle vente ne pourra être programmée ; les ventes en cours se terminent normalement.',
  closeConfirmGo: 'Oui, clôturer',
  closeCancel: 'Annuler',
  closePending: 'Clôture…',
  gameClosed: 'Partie close',
  gameClosedHint: 'La partie est close : plus aucune nouvelle vente ne peut être programmée.',
  podiumTitle: 'Podium final',
  podiumRow: (rank: number, user: string, value: number, lutins: number): string =>
    `${rank}. ${user} — ${value} pts · ${lutins} lutin(s)`,
} as const

/** French wording of the sales form error codes. */
export const SALES_ERROR_MESSAGES: Record<SalesFieldError, string> = {
  required: 'Choisissez un lutin dans l’inventaire.',
  positive_int: 'Entrez un entier strictement positif.',
  non_negative_int: 'Entrez un entier positif ou nul.',
}

/** French message of a field error, or null when the field is valid. */
export function salesFieldMessage(errors: SalesErrors, field: SalesField): string | null {
  const code = errors[field]
  return code !== undefined ? SALES_ERROR_MESSAGES[code] : null
}

// --- Enchères (task I : liste, salle de vente, classement) ----------------------

/** Shared loading / retry wording of the live pages. */
export const LOAD_STATE_TEXT = {
  loading: 'Chargement…',
  retry: 'Réessayer',
} as const

/** Amount with its unit, shared by every price line of the auction pages. */
export const pointsText = (amount: number): string => `${amount} pts`

/** Home page (/) wording: open and upcoming auction lists. */
export const AUCTIONS_TEXT = {
  openSection: 'Ventes en cours',
  scheduledSection: 'Ventes à venir',
  emptyOpen: 'Aucune vente en cours pour le moment.',
  emptyScheduled: 'Aucune vente programmée pour le moment.',
  currentPrice: (amount: number): string => `Mise courante : ${pointsText(amount)}`,
  startPrice: (amount: number): string => `Prix de départ : ${pointsText(amount)}`,
  upcoming: 'À venir',
  joinRoom: 'Accéder à la salle',
} as const

/** Auction room (/vente/:id) wording. */
export const AUCTION_ROOM_TEXT = {
  roomTitle: 'Salle de vente',
  backToList: 'Toutes les ventes',
  chronoLabel: 'Temps restant',
  closing: 'Clôture en cours…',
  antiSniping: 'Anti-sniping : une mise dans les 10 dernières secondes prolonge la vente de 10 s.',
  factStartPrice: 'Prix de départ',
  factIncrement: 'Palier minimal',
  points: pointsText,
  bidAmountLabel: 'Montant de la mise (points)',
  suggestionHint: (increment: number): string =>
    `Suggestion : mise courante + ${increment}, ou le prix de départ pour la première mise.`,
  bidSubmit: 'Miser',
  invalidAmount: 'Saisis un montant entier positif (en points).',
  balance: (amount: number): string => `Solde disponible : ${pointsText(amount)}`,
  socketClosed: 'Mise indisponible : la connexion temps réel n’est pas établie.',
  loginToBid: 'Connecte-toi pour participer aux enchères.',
  outbidNotice: (by: string, amount: number): string =>
    `Tu as été surenchéri par ${by} (${pointsText(amount)}).`,
  reconnecting:
    'Connexion perdue — reconnexion en cours, les événements manqués seront rattrapés.',
  scheduledNotice: 'Cette vente n’a pas encore commencé.',
  alreadyEnded: 'Cette vente est terminée.',
  endedTitle: 'Vente terminée',
  endedWinner: (winner: string, amount: number): string =>
    `Remportée par ${winner} pour ${pointsText(amount)}.`,
  endedYou: (lutin: string, amount: number): string =>
    `Tu remportes ${lutin} pour ${pointsText(amount)} !`,
  endedNoBid: 'Vente sans mise : le lutin retourne en vitrine.',
  notFound: 'Cette vente n’existe pas ou plus.',
  bidHistoryTitle: 'Historique des mises',
  noBids: 'Aucune mise pour l’instant.',
  bidAmount: pointsText,
  presenceTitle: 'Connectés',
  presenceCount: (count: number): string => `${count} connecté${count > 1 ? 's' : ''}`,
} as const

/** Leaderboard (/classement) wording. */
export const LEADERBOARD_TEXT = {
  rank: 'Rang',
  player: 'Joueur',
  value: 'Valeur de collection',
  lutins: 'Lutins',
  empty: 'Aucun joueur au classement pour l’instant.',
} as const

// --- Intégration (task J) -------------------------------------------------------

/** Game-closed banner wording (cahier §3.4), shown app-wide by the Layout. */
export const GAME_TEXT = {
  closed: 'Partie close : plus aucune nouvelle vente, le podium final est figé.',
} as const

/** Collection (/collection) wording. */
export const COLLECTION_TEXT = {
  empty: 'Aucun lutin remporté pour l’instant.',
  total: (value: number): string => `Valeur de collection : ${pointsText(value)}`,
  loginRequired: 'Connecte-toi pour voir ta collection.',
} as const
