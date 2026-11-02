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
