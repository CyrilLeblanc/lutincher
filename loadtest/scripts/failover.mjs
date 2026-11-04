// Phase 4 check under Docker: four WebSocket clients spread over api1 and api2
// by nginx, a bid seen by all of them, then `docker compose kill api1`: the
// clients on api1 drop, reconnect through nginx to api2, resync from the journal
// and keep receiving events. Run with Node 22 (global fetch and WebSocket) and
// the stack up on localhost:3000. It stops api1 for about a minute.
// Usage, from the repo root: node loadtest/scripts/failover.mjs
// COMPOSE overrides the compose command (e.g. COMPOSE=docker-compose).
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const BASE = 'http://localhost:3000/api'
const WS_URL = 'ws://localhost:3000/ws'
const COMPOSE = process.env.COMPOSE ?? 'docker compose'
const CLIENTS = 4
const PASSWORD = 'motdepasse-test-123'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const outcomes = []
function check(name, ok, detail = '') {
  outcomes.push(Boolean(ok))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
}

async function waitFor(predicate, timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const found = predicate()
    if (found) return found
    await sleep(50)
  }
  return undefined
}

async function register(username) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`register ${username}: HTTP ${res.status}`)
  return (await res.json()).token
}

// Keeps one socket per client; a dropped socket reconnects after 1 s, through nginx.
function connect(client) {
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(client.token)}`)
  client.ws = ws
  ws.onopen = () => {
    client.open = true
  }
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    client.received.push(msg)
    if (Number.isInteger(msg.seq)) client.lastSeq = Math.max(client.lastSeq, msg.seq)
  }
  ws.onerror = () => {}
  ws.onclose = () => {
    client.open = false
    client.closes += 1
    if (!client.stopped) setTimeout(() => connect(client), 1000)
  }
}

// Bids at the minimum the server reports (its bid_too_low detail names it).
async function bidUntilAccepted(client, auctionId) {
  let amount = 1
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const mark = client.received.length
    client.ws.send(JSON.stringify({ type: 'bid', auction_id: auctionId, amount }))
    const reply = await waitFor(
      () =>
        client.received
          .slice(mark)
          .find(
            (m) =>
              m.type === 'error' ||
              (m.type === 'bid' && m.auction_id === auctionId && m.amount === amount),
          ),
      3000,
    )
    if (!reply) return null
    if (reply.type === 'bid') return amount
    const minimum = /minimum of (\d+)/.exec(reply.detail ?? '')
    if (!minimum) return null
    amount = Number(minimum[1])
  }
  return null
}

const stamp = Date.now().toString(36)
const clients = []
for (let i = 0; i < CLIENTS; i += 1) {
  const token = await register(`fo${stamp}${i}`)
  clients.push({
    token,
    ws: null,
    open: false,
    closes: 0,
    lastSeq: 0,
    received: [],
    stopped: false,
  })
}
clients.forEach(connect)
check('quatre clients connectés via nginx', await waitFor(() => clients.every((c) => c.open), 10000))

const listing = await (
  await fetch(`${BASE}/auctions`, { headers: { authorization: `Bearer ${clients[0].token}` } })
).json()
const auctions = Array.isArray(listing) ? listing : (listing.auctions ?? listing.items ?? [])
const auction = auctions.find((a) => a.status === 'open')
check('une vente ouverte', auction, auction ? auction.id : 'aucune')

if (auction) {
  const auctionId = auction.id
  const firstBid = await bidUntilAccepted(clients[0], auctionId)
  const seenBefore = await waitFor(
    () =>
      clients.every((c) =>
        c.received.some((m) => m.type === 'bid' && m.auction_id === auctionId && m.amount === firstBid),
      ),
    3000,
  )
  check('mise diffusée à tous les clients (deux instances)', firstBid && seenBefore, `montant ${firstBid}`)

  const closesBefore = clients.map((c) => c.closes)
  const seqBefore = clients.map((c) => c.lastSeq)
  execSync(`${COMPOSE} kill api1`, { cwd: REPO, stdio: 'inherit' })
  const dropped = await waitFor(() => clients.some((c, i) => c.closes > closesBefore[i]), 15000)
  const onApi1 = clients.filter((c, i) => c.closes > closesBefore[i]).length
  check('coupure de api1 : les clients de api1 tombent', dropped, `${onApi1} client(s) sur api1`)
  check('tous les clients reconnectés (api2)', await waitFor(() => clients.every((c) => c.open), 30000))

  const replies = await Promise.all(
    clients.map((c, i) => {
      const mark = c.received.length
      c.ws.send(JSON.stringify({ type: 'sync', last_seq: seqBefore[i] }))
      return waitFor(() => c.received.slice(mark).find((m) => m.type === 'sync'), 5000)
    }),
  )
  check(
    'resynchronisation après bascule',
    replies.every(Boolean),
    replies.map((r) => (r ? `${r.events?.length ?? 0} events` : 'absent')).join(', '),
  )

  const secondBid = await bidUntilAccepted(clients[1], auctionId)
  const seenAfter = await waitFor(
    () =>
      clients.every((c) =>
        c.received.some((m) => m.type === 'bid' && m.auction_id === auctionId && m.amount === secondBid),
      ),
    3000,
  )
  check('mise diffusée après bascule', secondBid && seenAfter, `montant ${secondBid}`)
}

for (const c of clients) {
  c.stopped = true
  c.ws.close()
}
execSync(`${COMPOSE} up -d api1`, { cwd: REPO, stdio: 'inherit' })
console.log(`${outcomes.filter(Boolean).length}/${outcomes.length} contrôles passent`)
process.exit(outcomes.every(Boolean) ? 0 : 1)
