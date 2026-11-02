// Stub — future live leaderboard (J6), fed by WS leaderboard events and
// GET /api/leaderboard.

import { PAGE_TEXT } from '../ui/strings'

export function LeaderboardPage() {
  return (
    <section className="page">
      <h1>{PAGE_TEXT.leaderboard.title}</h1>
      <p className="page-intro">{PAGE_TEXT.leaderboard.intro}</p>
    </section>
  )
}
