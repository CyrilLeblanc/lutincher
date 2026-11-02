// Registration page (J1): pseudo (3–30) + password (>= 4) only — no e-mail,
// no confirmation. Length rules are checked client-side by the pure
// credentials module; AuthContext.register then auto-logs in (1000 points
// offered by the server). Success redirects to the auctions home.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  EMPTY_CREDENTIALS,
  validateRegistration,
  type Credentials,
} from '../auth/credentials'
import { AuthForm } from '../components/AuthForm'
import { ROUTE_PATHS } from '../ui/routes'
import { AUTH_FORM_TEXT, PAGE_TEXT, credentialErrorMessage, messageForError } from '../ui/strings'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Credentials>(EMPTY_CREDENTIALS)
  const [fieldErrors, setFieldErrors] = useState(validateRegistration(EMPTY_CREDENTIALS))
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleFieldChange = (field: 'username' | 'password', value: string): void => {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (): void => {
    const errors = validateRegistration(values)
    setFieldErrors(errors)
    setFormError(null)
    if (errors.username !== undefined || errors.password !== undefined) return
    setPending(true)
    register(values.username, values.password)
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
      <h1>{PAGE_TEXT.register.title}</h1>
      <p className="page-intro">{PAGE_TEXT.register.intro}</p>
      <AuthForm
        values={values}
        onFieldChange={handleFieldChange}
        onSubmit={handleSubmit}
        submitLabel={AUTH_FORM_TEXT.registerSubmit}
        pendingLabel={AUTH_FORM_TEXT.registerPending}
        pending={pending}
        formError={formError}
        usernameError={credentialErrorMessage(fieldErrors, 'username')}
        passwordError={credentialErrorMessage(fieldErrors, 'password')}
        withHints
        autoCompletePassword="new-password"
      />
      <p className="auth-switch">
        <Link to={ROUTE_PATHS.login}>{AUTH_FORM_TEXT.toLogin}</Link>
      </p>
    </section>
  )
}
