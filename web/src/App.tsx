// Root: provider nesting (Auth → Socket → Router) and the route table.
// Auth owns the session/token; SocketContext owns the single app-wide
// WebSocket built from that token; pages consume them via useAuth/useSocket.

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAdmin } from './auth/RequireAdmin'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/AdminPage'
import { AuctionPage } from './pages/AuctionPage'
import { AuctionsPage } from './pages/AuctionsPage'
import { CollectionPage } from './pages/CollectionPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage } from './pages/LoginPage'
import { LutinPage } from './pages/LutinPage'
import { RegisterPage } from './pages/RegisterPage'
import { SocketProvider } from './socket/SocketProvider'
import { ROUTE_PATHS } from './ui/routes'
import { PAGE_TEXT } from './ui/strings'

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<AuctionsPage />} />
              <Route path={ROUTE_PATHS.auction} element={<AuctionPage />} />
              <Route path={ROUTE_PATHS.lutin} element={<LutinPage />} />
              <Route path={ROUTE_PATHS.collection} element={<CollectionPage />} />
              <Route path={ROUTE_PATHS.leaderboard} element={<LeaderboardPage />} />
              <Route path={ROUTE_PATHS.login} element={<LoginPage />} />
              <Route path={ROUTE_PATHS.register} element={<RegisterPage />} />
              <Route
                path={ROUTE_PATHS.admin}
                element={
                  <RequireAdmin>
                    <AdminPage />
                  </RequireAdmin>
                }
              />
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
      </SocketProvider>
    </AuthProvider>
  )
}
