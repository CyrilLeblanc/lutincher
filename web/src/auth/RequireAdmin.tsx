// Route guard for the admin studio (A1–A3): renders the page only for a
// logged-in admin; anyone else is redirected to the auctions home.

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../ui/routes'
import { useAuth } from './AuthContext'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()

  // A token without a profile yet means GET /api/me is still in flight
  // (e.g. hard reload of /admin): render nothing rather than bouncing a
  // legitimate admin before the profile arrives.
  if (token !== null && user === null) return null
  if (user?.role !== 'admin') return <Navigate to={ROUTE_PATHS.auctions} replace />
  return children
}
