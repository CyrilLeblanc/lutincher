// Stub — future registration form (J1): POST /api/auth/register (1000 points
// offered) then auto-login.

import { PAGE_TEXT } from '../ui/strings'

export function RegisterPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.register.title}</h1>
      <p className="page-intro">{PAGE_TEXT.register.intro}</p>
    </section>
  )
}
