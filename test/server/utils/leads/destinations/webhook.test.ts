// test/server/utils/leads/destinations/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lead, LeadDelivery } from '~~/app/types'

// webhook.ts calls registerAdapter(adapter) at module load; mock the leaf registry.
vi.mock('../../../../../server/utils/leads/destinations/registry', () => ({
  registerAdapter: vi.fn(),
  getAdapter: vi.fn(),
  listAdapterTypes: vi.fn()
}))

const { default: adapter } = await import('../../../../../server/utils/leads/destinations/webhook')

const baseLead: Lead = {
  id: 'L1', source: 'google', source_lead_id: 's1', field_data: { email: 'a@b.co' },
  attribution: null, status: 'new', form_id: 'F1'
}
const baseDelivery: LeadDelivery = {
  id: 'D1', lead_id: 'L1', idempotency_key: 'idem-1', destination_type: 'webhook'
}

describe('validateConfig', () => {
  it('requires HTTPS', () => {
    expect(adapter.validateConfig({ url: 'http://evil.example' }).valid).toBe(false)
  })
  it('blocks localhost / private IPs (SSRF)', () => {
    expect(adapter.validateConfig({ url: 'https://localhost/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://127.0.0.1/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://10.0.0.5/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://192.168.1.1/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://169.254.169.254/' }).valid).toBe(false)
  })
  it('blocks IPv6 loopback / link-local / IPv4-mapped (SSRF)', () => {
    expect(adapter.validateConfig({ url: 'https://[::1]/callback' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://[::ffff:127.0.0.1]/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://[::ffff:10.0.0.1]/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://[fe80::1]/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://[fc00::1]/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://[fd12:3456::1]/x' }).valid).toBe(false)
  })
  it('rejects CRLF-injected headers', () => {
    expect(adapter.validateConfig({
      url: 'https://x.example/h',
      headers: { 'X-Bad': 'v\r\nInjected: y' }
    }).valid).toBe(false)
  })
  it('accepts a valid HTTPS URL', () => {
    expect(adapter.validateConfig({ url: 'https://acme.example.com/leads' }).valid).toBe(true)
  })
})

describe('dispatch', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('POSTs JSON with idempotency header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('delivered')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['X-Leads-Idempotency-Key']).toBe('idem-1')
    expect(init.headers['Content-Type']).toBe('application/json')
  })
  it('adds HMAC signature when secret provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h', secret: 'top-secret' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['X-Leads-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })
  it('returns failed on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
  })
  it('returns failed on 4xx but with retry suppression hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
    expect((r as typeof r & { retry_after_ms?: number }).retry_after_ms).toBeUndefined()
  })
  it('honors 429 Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('rl', { status: 429, headers: { 'Retry-After': '7' } })
    ))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
    expect((r as typeof r & { retry_after_ms?: number }).retry_after_ms).toBe(7000)
  })
})
