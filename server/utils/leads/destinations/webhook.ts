// server/utils/leads/destinations/webhook.ts
import { createHmac } from 'node:crypto'
import { registerAdapter } from './registry'
import type { DestinationAdapter, DispatchResult } from './types'

interface Cfg { url: string; method?: 'POST' | 'PUT'; headers?: Record<string, string>; secret?: string }

// Block IPv4 + IPv6 loopback / RFC1918 / link-local / unique-local / IPv4-mapped IPv6.
// `::ffff:` is the IPv4-mapped-IPv6 prefix; URL.hostname canonicalises the dotted
// IPv4 part to hex (e.g. `[::ffff:127.0.0.1]` -> `[::ffff:7f00:1]`), so we block
// the whole prefix rather than try to enumerate every private form.
const PRIVATE_HOST_RE = /^(?:localhost$|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|::ffff:|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i

function isPrivateHost(host: string): boolean {
  // URL.hostname returns IPv6 wrapped in brackets — strip them before matching.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return PRIVATE_HOST_RE.test(bare)
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'webhook',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!c?.url || typeof c.url !== 'string') errors.url = 'URL required'
    else {
      try {
        const u = new URL(c.url)
        if (u.protocol !== 'https:') errors.url = 'HTTPS required'
        else if (isPrivateHost(u.hostname)) errors.url = 'Private/loopback hosts blocked'
      } catch { errors.url = 'Invalid URL' }
    }
    if (c?.headers) {
      for (const [k, v] of Object.entries(c.headers)) {
        if (typeof v !== 'string' || /[\r\n]/.test(v)) {
          errors.headers = `Invalid value for ${k}`
          break
        }
      }
    }
    if (c?.method && !['POST', 'PUT'].includes(c.method)) errors.method = 'POST or PUT only'
    if (c?.secret && typeof c.secret !== 'string') errors.secret = 'Must be string'
    return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors }
  },
  async dispatch(delivery, lead, config) {
    const v = adapter.validateConfig(config)
    if (!v.valid) return { status: 'failed', error: `invalid_config: ${JSON.stringify(v.errors)}` }
    const body = JSON.stringify({
      delivery_id: delivery.id,
      idempotency_key: delivery.idempotency_key,
      lead: {
        id: lead.id, source: lead.source, source_lead_id: lead.source_lead_id,
        form_id: lead.form_id, form_name: lead.form_name,
        submitted_at: lead.submitted_at, field_data: lead.field_data,
        attribution: lead.attribution, status: lead.status,
      },
    })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Leads-Idempotency-Key': delivery.idempotency_key,
      ...(config.headers ?? {}),
    }
    if (config.secret) {
      const sig = createHmac('sha256', config.secret).update(body).digest('hex')
      headers['X-Leads-Signature'] = `sha256=${sig}`
    }
    let resp: Response
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      try {
        resp = await fetch(config.url, {
          method: config.method ?? 'POST',
          headers, body, signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
    } catch (e: any) {
      return { status: 'failed', error: `network_error: ${e?.message ?? String(e)}` }
    }
    if (resp.ok) {
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    }
    const result: DispatchResult = { status: 'failed', error: `http_${resp.status}` }
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After')
      const seconds = ra ? Number(ra) : 60
      ;(result as any).retry_after_ms = (Number.isFinite(seconds) ? seconds : 60) * 1000
    }
    return result
  },
}

registerAdapter(adapter)
export default adapter
