// Auth provider (J1): owns the token state. A token surviving a reload
// restores the session; the profile follows via useMe whenever the token
// changes (login, register, logout). An expired token ends the session, at
// load or when its `exp` passes, and flags it for the layout (T2).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { API_PATHS, clearToken, post, readToken, storeToken } from '../api/http'
import { useMe } from '../api/useMe'
import type { AuthRequest, AuthResponse } from '../socket/contract'
import { authContext, type AuthState } from './AuthContext'
import { isTokenExpired, tokenExpiresAt } from './tokenExpiry'

/** Shared body of register/login: send credentials, persist and return the JWT. */
async function openSession(path: string, credentials: AuthRequest): Promise<string> {
  const response = await post<AuthResponse>(path, credentials)
  storeToken(response.token)
  return response.token
}

interface Session {
  token: string | null
  expired: boolean
}

/** Stored session at load: a token already past its expiry is dropped. */
function initialSession(): Session {
  const token = readToken()
  if (token === null) return { token: null, expired: false }
  if (!isTokenExpired(token)) return { token, expired: false }
  clearToken()
  return { token: null, expired: true }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(initialSession)
  const { token, expired } = session
  const user = useMe(token)

  // End the session when the token expires while the app is open.
  useEffect(() => {
    if (token === null) return
    const expiresAt = tokenExpiresAt(token)
    if (expiresAt === null) return
    const timer = setTimeout(() => {
      clearToken()
      setSession({ token: null, expired: true })
    }, Math.max(0, expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [token])

  const register = useCallback(async (username: string, password: string): Promise<void> => {
    setSession({ token: await openSession(API_PATHS.register, { username, password }), expired: false })
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    setSession({ token: await openSession(API_PATHS.login, { username, password }), expired: false })
  }, [])

  const logout = useCallback((): void => {
    setSession({ token: null, expired: false })
    clearToken()
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, token, sessionExpired: expired, register, login, logout }),
    [user, token, expired, register, login, logout],
  )

  return <authContext.Provider value={value}>{children}</authContext.Provider>
}
