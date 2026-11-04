// Expired JWT (cahier T2): the client reads `exp` from the token payload to end
// the session itself, instead of retrying the socket with a dead token. The
// signature is not checked here — the server stays authoritative.

import { isRecord } from '../socket/contract'

/** Pure: expiry of a JWT in ms since epoch; null when unreadable. */
export function tokenExpiresAt(token: string): number | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims: unknown = JSON.parse(atob(base64))
    if (!isRecord(claims) || typeof claims.exp !== 'number') return null
    return claims.exp * 1000
  } catch {
    return null
  }
}

/** Pure: true once the token is past its expiry (an unreadable token is expired). */
export function isTokenExpired(token: string, now: number = Date.now()): boolean {
  const expiresAt = tokenExpiresAt(token)
  return expiresAt === null || expiresAt <= now
}
