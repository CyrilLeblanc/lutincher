// Live leaderboard (/classement): REST snapshot from GET /api/leaderboard,
// then full refresh on every WS `leaderboard` event. Ranking logic (cahier
// §3.4 tie-breaks) lives in the pure pages/leaderboard.ts.

import '../styles/live.css'
import { API_PATHS, get } from '../api/http'
import { LoadState } from '../components/LoadState'
import type { LeaderboardRow, LeaderboardSnapshot } from '../socket/contract'
import { LEADERBOARD_TEXT, PAGE_TEXT, messageForError } from '../ui/strings'
import {
  EMPTY_LEADERBOARD,
  applyLeaderboardEvent,
  sortLeaderboard,
} from './leaderboard'
import { useLiveSnapshot } from './useLiveSnapshot'

export function LeaderboardPage() {
  const live = useLiveSnapshot<readonly LeaderboardRow[], readonly LeaderboardRow[]>({
    key: 'leaderboard',
    initial: EMPTY_LEADERBOARD,
    fetchSnapshot: () => get<LeaderboardSnapshot>(API_PATHS.leaderboard).then((s) => s.rows),
    fromSnapshot: (rows) => sortLeaderboard(rows),
    applyEvent: applyLeaderboardEvent,
    failureMessage: messageForError,
  })

  return (
    <section className="page">
      <h1>{PAGE_TEXT.leaderboard.title}</h1>
      <p className="page-intro">{PAGE_TEXT.leaderboard.intro}</p>
      <LoadState phase={live.phase} message={live.message} onRetry={live.retry} />
      {live.phase === 'ready' &&
        (live.state.length === 0 ? (
          <p className="empty-note">{LEADERBOARD_TEXT.empty}</p>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th scope="col">{LEADERBOARD_TEXT.rank}</th>
                <th scope="col">{LEADERBOARD_TEXT.player}</th>
                <th scope="col" className="is-num">
                  {LEADERBOARD_TEXT.value}
                </th>
                <th scope="col" className="is-num">
                  {LEADERBOARD_TEXT.lutins}
                </th>
              </tr>
            </thead>
            <tbody>
              {live.state.map((row, index) => (
                <tr key={row.user} className={index === 0 ? 'is-first' : undefined}>
                  <td className="leaderboard-table__rank">{index + 1}</td>
                  <td className="leaderboard-table__player">{row.user}</td>
                  <td className="is-num">{row.value}</td>
                  <td className="is-num">{row.lutins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  )
}
