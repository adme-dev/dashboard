import { createError, getHeader } from 'h3'
import { invalidatePrefix } from '../../utils/cache'
import { kvDelete } from '../../utils/kv'

/**
 * POST /api/xero/webhook
 *
 * Receives Xero webhooks for invoice/contact changes.
 * Invalidates relevant caches so live dashboards pick up fresh data.
 *
 * Xero webhooks send events for:
 *   - INSERT Invoice
 *   - UPDATE Invoice
 *   - DELETE Invoice (rare)
 *   - INSERT Contact
 *   - UPDATE Contact
 *
 * Security: Xero signs webhooks with HMAC-SHA256. The signature is sent in
 * the `x-xero-signature` header as a base64-encoded digest of the raw body.
 * We verify this before processing. If XERO_WEBHOOK_KEY is not set, the
 * webhook is accepted without verification (dev/test environments).
 */

async function verifyXeroSignature(rawBody: string, signature: string | undefined, key: string): Promise<boolean> {
  if (!signature || !key) return false
  const { createHmac } = await import('node:crypto')
  const computed = createHmac('sha256', key).update(rawBody).digest('base64')
  return computed === signature
}

export default defineEventHandler(async (event) => {
  // Verify HMAC-SHA256 signature if webhook key is configured
  const webhookKey = process.env.XERO_WEBHOOK_KEY || ''
  let body: any
  if (webhookKey) {
    const signature = getHeader(event, 'x-xero-signature')
    const rawBody = await readRawBody(event, 'utf-8').catch(() => null)
    if (!rawBody) {
      throw createError({ statusCode: 400, statusMessage: 'Empty body' })
    }
    const ok = await verifyXeroSignature(rawBody, signature, webhookKey)
    if (!ok) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }
    // Parse the already-read body
    try { body = JSON.parse(rawBody) } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
    }
  } else {
    // No webhook key configured — read parsed body (dev/test only)
    body = await readBody<any>(event).catch(() => null)
  }

  const tenantId = getHeader(event, 'xero-tenant-id') || body?.tenantId

  // Xero webhooks include an events array
  const events = body?.events || []
  const hasInvoiceEvent = events.some((e: any) =>
    e?.resource?.toLowerCase?.() === 'invoice' ||
    e?.eventType?.toLowerCase?.().includes('invoice') ||
    e?.eventCategory?.toLowerCase?.().includes('invoice')
  )

  if (tenantId) {
    // Invalidate KPI caches
    await invalidatePrefix(`kpis:${tenantId}`)

    // Invalidate invoice-related caches
    await invalidatePrefix(`xero-report:${tenantId}:invoices`)
    await invalidatePrefix(`xero-report:${tenantId}`)

    // Invalidate Get Out cashflow cache (live tracking)
    await invalidatePrefix(`xero-get-out:${tenantId}`)

    // Also try to delete from KV directly (cachedFetch uses KV)
    try {
      await kvDelete(event, `xero-get-out:${tenantId}`)
    } catch {
      // KV may not be available in dev
    }

    // If invoice event, also invalidate pipeline and aging reports
    if (hasInvoiceEvent) {
      await invalidatePrefix(`xero-report:${tenantId}:invoice-pipeline`)
      await invalidatePrefix(`xero-report:${tenantId}:aging`)
    }
  }

  return { ok: true, invalidated: tenantId ? true : false }
})
