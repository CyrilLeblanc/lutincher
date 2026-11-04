// Per-palier table of one series: k6 summary (results json) + Prometheus windows.
// Usage: node analyse.mjs <results.json> <start-file> <end-file>
// Palier i holds from t0 + 200 i + 20 s to t0 + 200 (i + 1) s (protocol §3); t0 is
// the first moment the gauge is non zero (the bidders connect at the start).
import { readFileSync } from 'node:fs'

const [resultsPath, startPath, endPath] = process.argv.slice(2)
const PROM = 'http://localhost:9090/api/v1'
const STEP_S = 200
const HOLD_S = 180
const SPECTATORS = [10, 50, 100, 200]
const k6 = JSON.parse(readFileSync(resultsPath, 'utf8')).metrics

const epoch = (path) => Math.floor(new Date(readFileSync(path, 'utf8').trim()).getTime() / 1000)
const startEpoch = epoch(startPath)
const endEpoch = epoch(endPath)

async function query(expr, time) {
  const url = new URL(`${PROM}/query`)
  url.searchParams.set('query', expr)
  url.searchParams.set('time', String(time))
  const body = await (await fetch(url)).json()
  return body.data.result
}

async function range(expr, start, end, step) {
  const url = new URL(`${PROM}/query_range`)
  url.searchParams.set('query', expr)
  url.searchParams.set('start', String(start))
  url.searchParams.set('end', String(end))
  url.searchParams.set('step', String(step))
  const body = await (await fetch(url)).json()
  return body.data.result[0]?.values ?? []
}

const value = (result) => (result.length ? Number(result[0].value[1]) : NaN)
const timeline = await range('sum(lutincher_ws_connections)', startEpoch - 60, endEpoch + 60, 5)
const first = timeline.find(([, v]) => Number(v) >= 1)
if (!first) throw new Error('no connection seen in Prometheus for this window')
const t0 = Number(first[0])
console.log(`t0 = ${new Date(t0 * 1000).toISOString()} (palier windows: +20 s to +200 s, +220 s to +400 s, ...)`)

console.log('| Spectateurs | Connexions (moy.) | p50 k6 (ms) | p95 k6 (ms) | Acceptées/s k6 | Acceptées/s serveur | Trames/s | p95 serveur (ms) | Refus serveur | ws_errors | Dégradé ? |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|')
for (let i = 0; i < SPECTATORS.length; i++) {
  const at = t0 + STEP_S * (i + 1)
  // Ends 10 s before the palier end: the gauge drops to 0 when the test stops, and that last sample would bias the average.
  const conns = value(await query(`avg_over_time(sum(lutincher_ws_connections)[${HOLD_S - 10}s:5s] offset 10s)`, at))
  const frames = value(await query(`sum(increase(lutincher_ws_frames_sent_total[${HOLD_S}s]))/${HOLD_S}`, at))
  const acceptedSrv = value(await query(`sum(increase(lutincher_bids_accepted_total[${HOLD_S}s]))/${HOLD_S}`, at))
  const p95Srv = value(await query(`histogram_quantile(0.95, sum by (le) (increase(lutincher_broadcast_latency_seconds_bucket[${HOLD_S}s])))`, at))
  const refusals = (await query(`sum by (code) (increase(lutincher_errors_total[${HOLD_S}s]))`, at))
    .map((r) => `${r.metric.code} ${Math.round(Number(r.value[1]))}`).join(', ') || '0'
  const rt = k6[`bid_roundtrip_ms{palier:${i}}`] || {}
  const acc = k6[`bids_accepted{palier:${i}}`] || {}
  const wsErr = (k6[`ws_errors{palier:${i}}`] || {}).count ?? 0
  const p95 = rt['p(95)']
  const degraded = p95 > 1000 || wsErr / conns > 0.01 ? 'oui' : 'non'
  console.log(`| ${SPECTATORS[i]} | ${conns.toFixed(0)} | ${rt.med?.toFixed(1)} | ${p95?.toFixed(1)} | ${(acc.count / HOLD_S).toFixed(2)} | ${acceptedSrv.toFixed(2)} | ${frames.toFixed(0)} | ${(p95Srv * 1000).toFixed(1)} | ${refusals} | ${wsErr} | ${degraded} |`)
}

const total = (name) => k6[name]?.count ?? 'absent'
console.log(`\nk6 total : mises envoyées ${total('bids_sent')}, acceptées ${total('bids_accepted')}, refusées ${total('bids_rejected')}, sessions ${total('ws_sessions')}, ws_errors ${total('ws_errors')}`)
