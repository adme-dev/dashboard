// scripts/loadtest-leads.mjs
// Pumps N synthetic Google Lead Form payloads through the local or staging
// webhook, then polls the DB to measure ingest + drain time.
//
// Usage:
//   node scripts/loadtest-leads.mjs \
//     --base http://localhost:3000 \
//     --token <url_token> \
//     --key <secret_key> \
//     --count 1000 --concurrency 50
//
// Pre-req: a webhook endpoint row exists (see /api/leads/endpoints/list).

import { argv, exit } from 'node:process'

const args = Object.fromEntries(
  argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []
  ),
)

const base = args.base ?? 'http://localhost:3000'
const token = args.token
const key = args.key
const count = Number(args.count ?? 1000)
const concurrency = Number(args.concurrency ?? 50)

if (!token || !key) {
  console.error('Required: --token and --key (from /api/leads/endpoints/list)')
  exit(1)
}

const url = `${base}/api/leads/webhook/google/${token}`

function payload(i) {
  return {
    google_key: key,
    lead_id: `loadtest-${Date.now()}-${i}`,
    api_version: '1.0',
    form_id: 'loadtest-form',
    campaign_id: 'LT-CAMPAIGN',
    gcl_id: `gcl-${i}`,
    user_column_data: [
      { column_name: 'EMAIL', string_value: `lt-${i}@example.test` },
      { column_name: 'FULL_NAME', string_value: `Load Tester ${i}` },
      { column_name: 'PHONE_NUMBER', string_value: `+6140${String(i).padStart(7, '0')}` },
    ],
  }
}

async function send(i) {
  const t0 = performance.now()
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(i)),
  })
  const dt = performance.now() - t0
  if (!r.ok) {
    const text = await r.text()
    return { ok: false, status: r.status, ms: dt, body: text.slice(0, 100) }
  }
  return { ok: true, status: r.status, ms: dt }
}

const start = performance.now()
let successes = 0
let failures = 0
const latencies = []

async function worker(idsQueue) {
  while (idsQueue.length) {
    const i = idsQueue.shift()
    if (i === undefined) break
    const r = await send(i)
    if (r.ok) {
      successes++
      latencies.push(r.ms)
    } else {
      failures++
      console.error('fail', r.status, r.body)
    }
  }
}

const ids = Array.from({ length: count }, (_, i) => i)
const workers = Array.from({ length: concurrency }, () => worker(ids))
await Promise.all(workers)

const total = (performance.now() - start) / 1000
latencies.sort((a, b) => a - b)
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0
const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0

console.log(`Sent ${count} in ${total.toFixed(1)}s — ${(count / total).toFixed(1)}/s`)
console.log(`Success: ${successes}, Failed: ${failures}`)
console.log(`Latency p50/p95/p99: ${p50.toFixed(0)}ms / ${p95.toFixed(0)}ms / ${p99.toFixed(0)}ms`)
