// Typed REST client: base '/api', JWT from localStorage, ApiError carrying the
// contract error codes. Helpers get/post keep call sites free of boilerplate.

import { isRecord, type ErrorCode } from '../socket/contract'

export const TOKEN_STORAGE_KEY = 'lutincher.token'

export const API_BASE = '/api'

/** REST endpoint paths — single source, no magic strings at call sites. */
export const API_PATHS = {
  register: '/auth/register',
  login: '/auth/login',
  me: '/me',
  auctions: '/auctions',
  leaderboard: '/leaderboard',
  adminLutinsParts: '/admin/lutins/parts',
  adminLutinsPreview: '/admin/lutins/preview',
  adminLutins: '/admin/lutins',
  adminAuctions: '/admin/auctions',
  adminGameClose: '/admin/game/close',
} as const

/** REST/network failures beyond the WS contract codes. */
export type ApiErrorCode = ErrorCode | 'not_found' | 'bad_request' | 'network_error' | 'unknown_error'

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  'unauthorized',
  'forbidden',
  'bid_too_low',
  'insufficient_funds',
  'auction_not_open',
  'malformed_message',
  'message_too_large',
  'rate_limited',
  'not_found',
  'bad_request',
  'network_error',
  'unknown_error',
])

/** Typed failure of any API call; UI maps `code` to a French message. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly detail: string
  /** HTTP status; 0 when the request never reached the server. */
  readonly status: number

  constructor(code: ApiErrorCode, detail: string, status: number) {
    super(detail.length > 0 ? detail : code)
    this.name = 'ApiError'
    this.code = code
    this.detail = detail
    this.status = status
  }
}

// --- Token storage (localStorage can throw in private mode) -------------------

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // Storage unavailable: the session simply won't survive a reload.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Nothing to clean up.
  }
}

/** Long-cacheable SVG portrait of a lutin (cahier §5). */
export function lutinSvgUrl(lutinId: string): string {
  return `${API_BASE}/lutins/${lutinId}.svg`
}

// --- Core request -------------------------------------------------------------

async function toApiError(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = 'unknown_error'
  let detail: string = response.statusText
  try {
    const payload: unknown = await response.json()
    if (isRecord(payload)) {
      if (typeof payload.code === 'string' && KNOWN_CODES.has(payload.code)) {
        code = payload.code as ApiErrorCode
      }
      if (typeof payload.detail === 'string') {
        detail = payload.detail
      }
    }
  } catch {
    // Non-JSON error body: fall back to the status line.
  }
  if (code === 'unknown_error') {
    if (response.status === 404) code = 'not_found'
    else if (response.status === 400) code = 'bad_request'
  }
  return new ApiError(code, detail, response.status)
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = readToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiError('network_error', cause instanceof Error ? cause.message : '', 0)
  }

  if (!response.ok) {
    throw await toApiError(response)
  }
  return (await response.json()) as T
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body)
}
