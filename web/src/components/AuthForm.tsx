// Shared username/password form of the login and register pages.
// Presentational only: values and already-French messages arrive as props,
// submission is delegated (the default event is prevented here).
// Client-side validation is disabled (noValidate) on purpose — the pages
// validate through the pure credentials module with French messages.

import type { FormEvent } from 'react'
import type { CredentialField, Credentials } from '../auth/credentials'
import { AUTH_FORM_TEXT } from '../ui/strings'

export interface AuthFormProps {
  values: Credentials
  onFieldChange: (field: CredentialField, value: string) => void
  onSubmit: () => void
  submitLabel: string
  pendingLabel: string
  pending: boolean
  /** Form-level French message (server error code mapped in strings.ts). */
  formError: string | null
  /** Field-level French message; null when the field is valid. */
  usernameError: string | null
  passwordError: string | null
  /** Show the J1 length hints under the fields (register only). */
  withHints: boolean
  autoCompletePassword: 'current-password' | 'new-password'
}

export function AuthForm({
  values,
  onFieldChange,
  onSubmit,
  submitLabel,
  pendingLabel,
  pending,
  formError,
  usernameError,
  passwordError,
  withHints,
  autoCompletePassword,
}: AuthFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!pending) onSubmit()
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span className="form-field__label">{AUTH_FORM_TEXT.usernameLabel}</span>
        <input
          className="text-input"
          name="username"
          value={values.username}
          onChange={(event) => onFieldChange('username', event.target.value)}
          autoComplete="username"
          disabled={pending}
          aria-invalid={usernameError !== null}
        />
        {withHints && usernameError === null && (
          <span className="form-field__hint">{AUTH_FORM_TEXT.usernameHint}</span>
        )}
        {usernameError !== null && (
          <span className="form-field__error">{usernameError}</span>
        )}
      </label>
      <label className="form-field">
        <span className="form-field__label">{AUTH_FORM_TEXT.passwordLabel}</span>
        <input
          className="text-input"
          name="password"
          type="password"
          value={values.password}
          onChange={(event) => onFieldChange('password', event.target.value)}
          autoComplete={autoCompletePassword}
          disabled={pending}
          aria-invalid={passwordError !== null}
        />
        {withHints && passwordError === null && (
          <span className="form-field__hint">{AUTH_FORM_TEXT.passwordHint}</span>
        )}
        {passwordError !== null && (
          <span className="form-field__error">{passwordError}</span>
        )}
      </label>
      {formError !== null && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  )
}
