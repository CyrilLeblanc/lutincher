// Load scenario: spectators and bidders on the auction WebSocket, through nginx.
// Protocol (paliers, durée, métriques): docs/protocole-mesure.md.
//
// A palier is a number of spectators: sockets that only listen, like a browser
// tab in the room (heartbeat `ping` every 10 s, as the client sends it). A fixed
// group of bidders bids every 2.5 s on a random sale. Each accepted bid is
// broadcast to every socket, so the fan-out grows with the spectators. The
// latency metric is the time between sending an accepted bid and receiving its
// broadcast back on the same socket (mise → diffusion, end to end).
// Every socket stays open for the whole test: no reconnection churn in the load.

import http from 'k6/http'
import ws from 'k6/ws'
import exec from 'k6/execution'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://localhost:3000'
const WS_BASE = BASE.replace(/^http/, 'ws')
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'lutincher'
// Increment 1 and 12 sales: a bidder holds at most 1000 points, so with an
// increment of 10 the three sales of the first series reached 1000 (§7).
const SALES = 12
const SALE_START_PRICE = 50
const SALE_INCREMENT = 1
const BIDDERS = 5
const SPECTATORS_PEAK = 200
const BID_EVERY_MS = 2500
const PING_EVERY_MS = 10000
const JSON_HEADERS = { 'Content-Type': 'application/json' }

const bidRoundtrip = new Trend('bid_roundtrip_ms', true)
const bidsSent = new Counter('bids_sent')
const bidsAccepted = new Counter('bids_accepted')
const bidsRejected = new Counter('bids_rejected')
const socketErrors = new Counter('ws_errors')
const connections = new Counter('ws_connections')

const LEVELS = [10, 50, 100, SPECTATORS_PEAK] // spectators per palier
const RAMP_MS = 20000
const STEP_MS = 200000 // one palier = 20 s ramp + 3 min hold
const TEST_MS = LEVELS.length * STEP_MS

// Palier index of a moment, counted from the test start. The ramp is tagged
// 'ramp' and kept out of the palier results: the protocol measures the hold.
function palierAt(startedAt, at = Date.now()) {
  const elapsed = at - startedAt
  const index = Math.floor(elapsed / STEP_MS)
  if (index >= LEVELS.length || elapsed % STEP_MS < RAMP_MS) return 'ramp'
  return index
}

// One scenario per bidder, one VU each: the scenario name picks the account.
// A shared VU index can repeat across scenarios, and two sockets on one account
// share one rate-limit budget (protocole-mesure §7).
const bidderScenarios = Object.fromEntries(
  Array.from({ length: BIDDERS }, (_, index) => [
    `bidder${index}`,
    { executor: 'constant-vus', vus: 1, duration: `${TEST_MS / 1000}s`, exec: 'bidder' },
  ]),
)

// Paliers 10 → 50 → 100 → 200 spectators, 3 min each (protocol §Montée en charge).
// The bidders run for the whole test. Criterion §5 (p95 > 1000 ms on a hold) is
// one threshold per palier.
export const options = {
  scenarios: {
    spectators: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: LEVELS.flatMap((target) => [
        { duration: '20s', target },
        { duration: '3m', target },
      ]),
      exec: 'spectator',
    },
    ...bidderScenarios,
  },
  // k6 exports a per-tag submetric only when a threshold names it: the count
  // thresholds (always true, so never a failure) make the per-palier counts appear.
  thresholds: Object.fromEntries(
    LEVELS.flatMap((_, index) => [
      [`bid_roundtrip_ms{palier:${index}}`, ['p(95)<1000']],
      [`bids_accepted{palier:${index}}`, ['count>=0']],
      [`ws_connections{palier:${index}}`, ['count>=0']],
      [`ws_errors{palier:${index}}`, ['count>=0']],
    ]),
  ),
}

function authHeaders(token) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } }
}

// Registers `count` accounts named load-<run>-<prefix><i>; returns their tokens.
function register(run, prefix, count) {
  const users = []
  for (let i = 0; i < count; i++) {
    const username = `load-${run}-${prefix}${i}`
    const res = http.post(
      `${BASE}/api/auth/register`,
      JSON.stringify({ username, password: 'loadtest' }),
      { headers: JSON_HEADERS },
    )
    if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status}`)
    users.push({ username, token: res.json('token') })
  }
  return users
}

export function setup() {
  const admin = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
    { headers: JSON_HEADERS },
  )
  if (admin.status !== 200) throw new Error(`admin login failed: ${admin.status}`)
  const adminAuth = authHeaders(admin.json('token'))

  // Fresh sales for this run: lutins with a deadline far beyond the test.
  const saleIds = []
  for (let i = 0; i < SALES; i++) {
    const lutin = http.post(`${BASE}/api/admin/lutins`, JSON.stringify({ rarity: 'rare' }), adminAuth)
    const sale = http.post(
      `${BASE}/api/admin/auctions`,
      JSON.stringify({
        lutin_id: lutin.json('id'),
        start_price: SALE_START_PRICE,
        increment: SALE_INCREMENT,
        duration_s: 3600,
      }),
      adminAuth,
    )
    if (sale.status !== 201) throw new Error(`sale creation failed: ${sale.status}`)
    saleIds.push(sale.json('id'))
  }

  // One account per socket; a run id keeps the names unique across runs.
  const run = Date.now().toString(36)
  const spectators = register(run, 's', SPECTATORS_PEAK)
  const bidders = register(run, 'b', BIDDERS)
  return { spectators, bidders, saleIds, startedAt: Date.now() }
}

// Spectators never bid, so their accounts may be shared between sockets.
export function spectator(data) {
  hold(data, data.spectators[Math.floor(Math.random() * data.spectators.length)], false)
}

export function bidder(data) {
  const index = Number(exec.scenario.name.replace('bidder', ''))
  hold(data, data.bidders[index], true)
}

// Only this run's sales: older ones may still be open from a previous run.
function loadSales(data, me) {
  return (http.get(`${BASE}/api/auctions`, authHeaders(me.token)).json('auctions') || [])
    .filter((sale) => data.saleIds.includes(sale.id))
}

// Opens one socket for the rest of the test. A spectator only listens; a bidder
// also places bids, from the amounts it sees in the broadcasts.
function hold(data, me, bids) {
  const remaining = data.startedAt + TEST_MS - Date.now()
  if (remaining <= 0) {
    // The test is over: a VU that comes back here must not open a socket.
    sleep(1)
    return
  }
  const sales = bids ? loadSales(data, me) : []
  const known = {}
  for (const sale of sales) known[sale.id] = sale.current_amount || 0

  // Bids sent and not accepted yet, keyed by `${auction_id}:${amount}`. An error
  // carries no amount, so it does not clear an entry: accepted bids match by key.
  const sent = new Map()
  let closed = false

  connections.add(1, { palier: palierAt(data.startedAt) })
  const res = ws.connect(`${WS_BASE}/ws?token=${me.token}`, {}, (socket) => {
    socket.on('open', () => {
      // Socket timers, not cleared: a k6 socket has no clearInterval (checked on
      // k6 1.8.2), so they stop on the `closed` flag instead.
      socket.setInterval(() => {
        if (!closed) socket.send(JSON.stringify({ type: 'ping' }))
      }, PING_EVERY_MS)
      if (bids) socket.setInterval(() => placeBid(socket), BID_EVERY_MS)
      socket.setTimeout(() => socket.close(), remaining)
    })

    if (bids) {
      socket.on('message', (raw) => {
        const event = JSON.parse(raw)
        if (event.type === 'bid') {
          known[event.auction_id] = event.amount
          const key = `${event.auction_id}:${event.amount}`
          if (event.bidder === me.username && sent.has(key)) {
            const sentAt = sent.get(key)
            bidRoundtrip.add(Date.now() - sentAt, { palier: palierAt(data.startedAt, sentAt) })
            bidsAccepted.add(1, { palier: palierAt(data.startedAt) })
            sent.delete(key)
          }
        } else if (event.type === 'error') {
          bidsRejected.add(1, { code: event.code, palier: palierAt(data.startedAt) })
        }
      })
    }

    socket.on('error', () => socketErrors.add(1, { palier: palierAt(data.startedAt) }))
    socket.on('close', () => {
      closed = true
    })

    function placeBid(s) {
      if (closed || sales.length === 0) return
      const sale = sales[Math.floor(Math.random() * sales.length)]
      const current = known[sale.id] || 0
      const amount = current === 0 ? sale.start_price : current + sale.increment
      sent.set(`${sale.id}:${amount}`, Date.now())
      s.send(JSON.stringify({ type: 'bid', auction_id: sale.id, amount }))
      bidsSent.add(1)
    }
  })

  check(res, { 'websocket upgraded': (r) => r && r.status === 101 })
}
