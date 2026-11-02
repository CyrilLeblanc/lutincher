// Stub — future login form (J1): POST /api/auth/login then store the JWT
// with storeToken().

import { PAGE_TEXT } from '../ui/strings'

export function LoginPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.login.title}</h1>
      <p className="page-intro">{PAGE_TEXT.login.intro}</p>
    </section>
  )
}
