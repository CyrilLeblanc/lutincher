// Auth context (J1): the session contract — the JWT and the profile snapshot
// from GET /api/me. The provider lives in AuthProvider.tsx (fast-refresh
// keeps components and hooks in separate files); register/login call the REST
// endpoints through the typed client and store the returned token
// (registration is an auto-login: no second request); logout drops the token.
// ApiError propagates to the caller (the forms map codes to French messages).

import { createContext, useContext } from 'react'
import type { UserMe } from '../socket/contract'

export interface AuthState {
  /** Profile from GET /api/me; null while logged out or loading. */
  user: UserMe | null
  /** Current JWT; null while logged out. */
  token: string | null
  /** POST /api/auth/register — stores the returned token (auto-login). */
  register: (username: string, password: string) => Promise<void>
  /** POST /api/auth/login — stores the returned token. */
  login: (username: string, password: string) => Promise<void>
  /** Drops the token and the session state. */
  logout: () => void
}

const MISSING_PROVIDER = 'useAuth requires <AuthProvider> above in the tree'

export const authContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(authContext)
  if (value === null) throw new Error(MISSING_PROVIDER)
  return value
}
