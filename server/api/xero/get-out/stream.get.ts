/**
 * Server-Sent Events (SSE) endpoint for live Get Out cashflow tracking
 * GET /api/xero/get-out/stream
 *
 * Pushes updated Get Out calculations every 30 seconds.
 * Falls back to heartbeat if data hasn't changed.
 */

import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { toXeroDateTime } from '~~/server/utils/xeroDataFetcher'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

const POLL_INTERVAL = 30000 // 30 seconds

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  // Set SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  let lastHash = ''
  let isConnectionClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventType: string, data: any) => {
        if (isConnectionClosed) return
        try {
          const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(new TextEncoder().encode(message))
        } catch {
          isConnectionClosed = true
        }
      }

      sendEvent('connected', { tenantId, timestamp: new Date().toISOString() })

      // Heartbeat every 30s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (isConnectionClosed) {
          clearInterval(heartbeatInterval)
          return
        }
        sendEvent('heartbeat', { timestamp: new Date().toISOString() })
      }, 30000)

      // Poll for Get Out data changes
      const pollInterval = setInterval(async () => {
        if (isConnectionClosed) {
          clearInterval(pollInterval)
          return
        }

        try {
          const today = new Date()
          const year = today.getFullYear()
          const month = today.getMonth() + 1
          const monthStart = new Date(year, month - 1, 1)

          const params = new URLSearchParams({
            where: `Type=="ACCREC"&&Date>=${toXeroDateTime(monthStart)}&&Status!="DRAFT"&&Status!="DELETED"&&Status!="VOIDED"`,
            order: 'Date DESC',
            pageSize: '100',
          })

          const body = await dedupedXeroCall(
            `get-out-sse:${tenantId}:${year}-${month}`,
            'get-out-sse',
            () => xeroFetch<any>({
              accessToken: token.access_token!,
              tenantId,
              path: `Invoices?${params.toString()}`,
              timeoutMs: 10000,
            })
          )

          const invoices = body?.invoices || []
          const currentMonthInvoicedTotal = invoices.reduce(
            (sum: number, inv: any) => sum + (Number(inv.total) || 0),
            0
          )

          // Simple hash to detect changes
          const hash = `${currentMonthInvoicedTotal}-${invoices.length}`
          if (!lastHash) {
            // The first successful poll establishes a baseline. Emitting here
            // would force a redundant full Get Out request on every opened tab.
            lastHash = hash
            return
          }
          if (hash !== lastHash) {
            lastHash = hash
            // Send a refresh signal — client fetches full data from /api/xero/get-out
            sendEvent('refresh', {
              reason: 'invoice_total_changed',
              timestamp: new Date().toISOString(),
            })
          }
        } catch (err) {
          // Silently ignore polling errors
          console.warn('[GetOut SSE] Poll error:', (err as any)?.message)
        }
      }, POLL_INTERVAL)

      // Handle client disconnect
      event.node.req.on('close', () => {
        isConnectionClosed = true
        clearInterval(heartbeatInterval)
        clearInterval(pollInterval)
        controller.close()
      })
    },
  })

  return sendStream(event, stream)
})
