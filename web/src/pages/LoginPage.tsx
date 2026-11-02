// Login page (J1): pseudo + password form calling AuthContext.login.
// Success redirects to the auctions home; failures map ApiError codes to
// French messages through strings.ts. No direct fetch — only the context.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  EMPTY_CREDENTIALS,
  validateLoginCredentials,
  type Credentials,
} from '../auth/credentials'
import { AuthForm } from '../components/AuthForm'
import { ROUTE_PATHS } from '../ui/routes'
import { AUTH_FORM_TEXT, PAGE_TEXT, credentialErrorMessage, messageForError } from '../ui/strings'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Credentials>(EMPTY_CREDENTIALS)
  const [fieldErrors, setFieldErrors] = useState(validateLoginCredentials(EMPTY_CREDENTIALS))
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleFieldChange = (field: 'username' | 'password', value: string): void => {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (): void => {
    const errors = validateLoginCredentials(values)
    setFieldErrors(errors)
    setFormError(null)
    if (errors.username !== undefined || errors.password !== undefined) return
    setPending(true)
    login(values.username, values.password)
      .then(() => {
        navigate(ROUTE_PATHS.auctions)
      })
      .catch((cause: unknown) => {
        setFormError(messageForError(cause))
      })
      .finally(() => {
        setPending(false)
      })
  }

  return (
    <section className="page">
      <h1>{PAGE_TEXT.login.title}</h1>
      <p className="page-intro">{PAGE_TEXT.login.intro}</p>
      <AuthForm
        values={values}
        onFieldChange={handleFieldChange}
        onSubmit={handleSubmit}
        submitLabel={AUTH_FORM_TEXT.loginSubmit}
        pendingLabel={AUTH_FORM_TEXT.loginPending}
        pending={pending}
        formError={formError}
        usernameError={credentialErrorMessage(fieldErrors, 'username')}
        passwordError={credentialErrorMessage(fieldErrors, 'password')}
        withHints={false}
        autoCompletePassword="current-password"
      />
      <p className="auth-switch">
        <Link to={ROUTE_PATHS.register}>{AUTH_FORM_TEXT.toRegister}</Link>
      </p>
    </section>
  )
}
