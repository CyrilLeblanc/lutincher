// App shell: header with brand, nav (admin entry only for admins), socket
// status pill, player balance and session controls. Reads the auth and
// socket contexts — presentational otherwise, no data fetching here.

import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useSocket } from '../socket/SocketContext'
import { ROUTE_PATHS } from '../ui/routes'
import { APP_NAME, LAYOUT_TEXT, NAV_LABELS, SOCKET_STATUS_LABELS } from '../ui/strings'

interface NavItem {
  to: string
  label: string
}

const PLAYER_NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: ROUTE_PATHS.auctions, label: NAV_LABELS.auctions },
  { to: ROUTE_PATHS.leaderboard, label: NAV_LABELS.leaderboard },
  { to: ROUTE_PATHS.collection, label: NAV_LABELS.collection },
]

const ADMIN_NAV_ITEM: NavItem = { to: ROUTE_PATHS.admin, label: NAV_LABELS.admin }

export function Layout() {
  const { user, logout } = useAuth()
  const { status } = useSocket()

  const navItems: ReadonlyArray<NavItem> =
    user?.role === 'admin' ? [...PLAYER_NAV_ITEMS, ADMIN_NAV_ITEM] : PLAYER_NAV_ITEMS

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="app-brand" to={ROUTE_PATHS.auctions}>
            {APP_NAME}
          </Link>
          <nav className="app-nav" aria-label={NAV_LABELS.main}>
            {navItems.map((item) => (
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
            {user !== null && (
              <span className="balance">
                {LAYOUT_TEXT.balance} : {user.points_available} {LAYOUT_TEXT.pointsUnit}
              </span>
            )}
            {status !== null && (
              <span className={`socket-status socket-status--${status}`}>
                {SOCKET_STATUS_LABELS[status]}
              </span>
            )}
            {user !== null ? (
              <>
                <span className="app-user">{user.user}</span>
                <button type="button" className="button button--ghost" onClick={logout}>
                  {LAYOUT_TEXT.logout}
                </button>
              </>
            ) : (
              <Link className="header-link" to={ROUTE_PATHS.login}>
                {NAV_LABELS.login}
              </Link>
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
