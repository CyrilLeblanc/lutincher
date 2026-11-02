// Root component: react-router-dom v7 in library mode.
// Owns the app-wide socket and profile snapshot, passed down to the Layout.
// TODO(web-shell): lift the token into shared state so login/logout reconnects
// the socket and refreshes /api/me without a reload.

import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { readToken } from './api/http'
import { useMe } from './api/useMe'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/AdminPage'
import { AuctionPage } from './pages/AuctionPage'
import { AuctionsPage } from './pages/AuctionsPage'
import { CollectionPage } from './pages/CollectionPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage } from './pages/LoginPage'
import { LutinPage } from './pages/LutinPage'
import { RegisterPage } from './pages/RegisterPage'
import { useAuctionSocket } from './socket/useAuctionSocket'
import { ROUTE_PATHS } from './ui/routes'
import { PAGE_TEXT } from './ui/strings'

export default function App() {
  const [token] = useState<string | null>(() => readToken())
  const me = useMe(token)
  const socket = useAuctionSocket({
    token,
    // Pages (web-enchères) will plug their stores here; the debug log keeps
    // the channel observable in the meantime.
    onEvent: (event) => console.debug('[lutincher] server event', event),
  })

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <Layout
              socketStatus={socket.status}
              pointsAvailable={me?.points_available ?? null}
            />
          }
        >
          <Route index element={<AuctionsPage />} />
          <Route path={ROUTE_PATHS.auction} element={<AuctionPage />} />
          <Route path={ROUTE_PATHS.lutin} element={<LutinPage />} />
          <Route path={ROUTE_PATHS.collection} element={<CollectionPage />} />
          <Route path={ROUTE_PATHS.leaderboard} element={<LeaderboardPage />} />
          <Route path={ROUTE_PATHS.login} element={<LoginPage />} />
          <Route path={ROUTE_PATHS.register} element={<RegisterPage />} />
          <Route path={ROUTE_PATHS.admin} element={<AdminPage />} />
          <Route
            path="*"
            element={
              <section className="page">
                <h1>{PAGE_TEXT.notFound.title}</h1>
                <p className="page-intro">{PAGE_TEXT.notFound.intro}</p>
              </section>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
