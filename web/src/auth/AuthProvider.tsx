// Auth provider (J1): owns the token state. A token surviving a reload
// restores the session; the profile follows via useMe whenever the token
// changes (login, register, logout).

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { API_PATHS, clearToken, post, readToken, storeToken } from '../api/http'
import { useMe } from '../api/useMe'
import type { AuthRequest, AuthResponse } from '../socket/contract'
import { authContext, type AuthState } from './AuthContext'

/** Shared body of register/login: send credentials, persist and return the JWT. */
async function openSession(path: string, credentials: AuthRequest): Promise<string> {
  const response = await post<AuthResponse>(path, credentials)
  storeToken(response.token)
  return response.token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken())
  const user = useMe(token)

  const register = useCallback(async (username: string, password: string): Promise<void> => {
    setToken(await openSession(API_PATHS.register, { username, password }))
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    setToken(await openSession(API_PATHS.login, { username, password }))
  }, [])

  const logout = useCallback((): void => {
    setToken(null)
    clearToken()
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, token, register, login, logout }),
    [user, token, register, login, logout],
  )

  return <authContext.Provider value={value}>{children}</authContext.Provider>
}
