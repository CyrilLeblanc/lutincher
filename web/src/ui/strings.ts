// All French UI strings — the single source of user-facing text.
// Nothing else in the codebase should contain display copy.

import type { SocketStatus } from '../socket/auctionSocket'
import type { Rarity } from '../socket/contract'

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
} as const

export const LUTIN_CARD_TEXT = {
  imageAlt: (name: string): string => `Portrait SVG du lutin ${name}`,
  viewLutin: 'Voir la fiche',
} as const

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
