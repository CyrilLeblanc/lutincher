// Route path constants — no magic strings at call sites.
// Path parameters use the react-router `:param` syntax.

export const ROUTE_PATHS = {
  auctions: '/',
  auction: '/vente/:id',
  lutin: '/lutin/:id',
  collection: '/collection',
  leaderboard: '/classement',
  login: '/connexion',
  register: '/inscription',
  admin: '/admin',
} as const

/** Concrete path of an auction room. */
export function auctionPath(auctionId: string): string {
  return `/vente/${auctionId}`
}

/** Concrete path of a lutin sheet. */
export function lutinPath(lutinId: string): string {
  return `/lutin/${lutinId}`
}
