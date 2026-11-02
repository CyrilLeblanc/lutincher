// Pure credential rules shared by the login and register forms (J1).
// The register form enforces the lengths client-side with friendly French
// messages; the server stays authoritative in all cases.

/** Field names of the auth forms, mirroring AuthRequest of the contract. */
export interface Credentials {
  username: string
  password: string
}

export const EMPTY_CREDENTIALS: Credentials = { username: '', password: '' }

// Registration rules: pseudo 3–30 characters, password >= 4.
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
export const PASSWORD_MIN_LENGTH = 4

/** Client-side form error codes — French wording lives in strings.ts. */
export type CredentialErrorCode =
  | 'username_required'
  | 'password_required'
  | 'username_length'
  | 'password_length'

export type CredentialField = 'username' | 'password'

/** At most one error code per field; absent field = valid. */
export type CredentialErrors = Partial<Record<CredentialField, CredentialErrorCode>>

/** Login only needs non-empty fields; the server judges the rest. */
export function validateLoginCredentials(credentials: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (credentials.username.length === 0) errors.username = 'username_required'
  if (credentials.password.length === 0) errors.password = 'password_required'
  return errors
}

/** Registration additionally enforces the J1 length rules. */
export function validateRegistration(credentials: Credentials): CredentialErrors {
  const errors: CredentialErrors = validateLoginCredentials(credentials)
  if (
    errors.username === undefined &&
    (credentials.username.length < USERNAME_MIN_LENGTH ||
      credentials.username.length > USERNAME_MAX_LENGTH)
  ) {
    errors.username = 'username_length'
  }
  if (errors.password === undefined && credentials.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = 'password_length'
  }
  return errors
}
