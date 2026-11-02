// App shell: header with brand, nav, socket status and balance; Outlet for
// the routed page. Presentational — data arrives through props.

import { Link, NavLink, Outlet } from 'react-router-dom'
import type { SocketStatus } from '../socket/auctionSocket'
import { ROUTE_PATHS } from '../ui/routes'
import { APP_NAME, LAYOUT_TEXT, NAV_LABELS, SOCKET_STATUS_LABELS } from '../ui/strings'

export interface LayoutProps {
  /** Socket connection state; null hides the indicator (idle, no token). */
  socketStatus?: SocketStatus | null
  /** Available points; null hides the balance. */
  pointsAvailable?: number | null
}

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: ROUTE_PATHS.auctions, label: NAV_LABELS.auctions },
  { to: ROUTE_PATHS.collection, label: NAV_LABELS.collection },
  { to: ROUTE_PATHS.leaderboard, label: NAV_LABELS.leaderboard },
  { to: ROUTE_PATHS.admin, label: NAV_LABELS.admin },
]

export function Layout({ socketStatus = null, pointsAvailable = null }: LayoutProps) {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="app-brand" to={ROUTE_PATHS.auctions}>
            {APP_NAME}
          </Link>
          <nav className="app-nav" aria-label={NAV_LABELS.main}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="app-header__meta">
            {pointsAvailable !== null && (
              <span className="balance">
                {LAYOUT_TEXT.balance} : {pointsAvailable} {LAYOUT_TEXT.pointsUnit}
              </span>
            )}
            {socketStatus !== null && (
              <span className={`socket-status socket-status--${socketStatus}`}>
                {SOCKET_STATUS_LABELS[socketStatus]}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
