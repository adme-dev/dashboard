// server/api/leads/stream.get.ts
// Per-user SSE stream of newly-ingested leads. v1 polls every 5s — sufficient
// for inbox-level latency. Switch to LISTEN/NOTIFY or a Durable Object if needed.

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const res = event.node.res
  let lastIso = new Date(Date.now() - 5_000).toISOString()
  const send = (e: string, data: any) => {
    res.write(`event: ${e}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  send('hello', { ts: new Date().toISOString() })

  const interval = setInterval(async () => {
    try {
      const rows = await queryRows<{
        id: string; submitted_at: string; client_id: string | null; source: string
      }>(
        `SELECT id, submitted_at, client_id, source FROM leads
         WHERE ingested_at > $1 AND deleted_at IS NULL
         ORDER BY ingested_at ASC LIMIT 50`,
        [lastIso],
      )
      if (rows.length) {
        lastIso = new Date(Date.now()).toISOString()
        for (const r of rows) send('lead', r)
      } else {
        send('ping', { ts: new Date().toISOString() })
      }
    } catch (e: any) {
      send('error', { error: e?.message ?? String(e) })
    }
  }, 5_000)

  event.node.req.on('close', () => clearInterval(interval))
  return new Promise(() => {})
})
