import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolve, record } = vi.hoisted(() => ({ resolve: vi.fn(), record: vi.fn() }))
vi.mock('~~/server/utils/qr/resolve', () => ({ resolveQrCode: resolve }))
vi.mock('~~/server/utils/qr/scans', () => ({ recordScan: record, scanIpHash: vi.fn().mockResolvedValue('seed') }))
const { loadPage } = vi.hoisted(() => ({ loadPage: vi.fn() }))
vi.mock('~~/server/utils/qr/pages', () => ({ loadPublicQrPage: loadPage }))
vi.mock('~~/server/utils/qr/landing/render', () => ({ renderQrLandingPage: (i: any) => `<html>${i.config.headline}${i.preview ? ' PREVIEW' : ''}</html>` }))
vi.mock('~~/server/utils/turnstile', () => ({ isTurnstileEnabled: () => false }))
vi.mock('~~/server/utils/tracking/consent', () => ({ snapshotConsent: () => ({ tracking: 'granted' }) }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn().mockResolvedValue({ id: 'u1' }) }))

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: any, key: string) => string | undefined
  setResponseStatus: (event: any, status: number) => void
  setResponseHeaders: (event: any, headers: Record<string, string>) => void
  sendRedirect: (event: any, location: string, status: number) => void
}

testGlobal.defineEventHandler = fn => fn
;(globalThis as any).getQuery = (event: any) => event.query ?? {}
;(globalThis as any).getCookie = () => undefined
;(globalThis as any).getHeader = () => null
;(globalThis as any).useRuntimeConfig = () => ({ public: {} })
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.setResponseStatus = (event, status) => { event.node.res.statusCode = status }
testGlobal.setResponseHeaders = (event, headers) => {
  for (const [k, v] of Object.entries(headers)) event.node.res.setHeader(k, v)
}
testGlobal.sendRedirect = (event, location, status) => {
  event.node.res.statusCode = status
  event.node.res.setHeader('location', location)
}

function makeEvent(code: string) {
  const headers: Record<string, string> = {}
  const event: any = {
    context: { params: { code } },
    node: { res: { setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v }, statusCode: 200 } },
    method: 'GET'
  }
  ;(globalThis as any).__h3 = { event, headers, get status() { return event.node.res.statusCode } }
  return event
}
beforeEach(() => {
  vi.clearAllMocks()
  loadPage.mockResolvedValue(null)
})

describe('GET /q/:code', () => {
  it('302s to the destination and records a scan', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x', active: true })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    await handler(event)
    expect(event.node.res.statusCode).toBe(302)
    expect(record).toHaveBeenCalledOnce()
    const loc = new URL((globalThis as any).__h3.headers.location)
    expect(loc.origin + loc.pathname).toBe('https://dest.example/x')
    expect(loc.searchParams.get('utm_source')).toBe('qr')
    expect(loc.searchParams.get('xf_qr')).toBe('AbC1234') // legacy cache entry (no code/utm fields) → tagging still on
  })

  it('sends the whole split to variant B and tags the arm', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/a', active: true, code: 'AbC1234', ab: { enabled: true, variantBUrl: 'https://dest.example/b', splitPct: 100 } })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    await handler(event)
    const loc = new URL((globalThis as any).__h3.headers.location)
    expect(loc.origin + loc.pathname).toBe('https://dest.example/b')
    expect(loc.searchParams.get('xf_qr_variant')).toBe('B')
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.anything(), { variant: 'B' })
  })
  it('keeps the primary URL for a 0% split and records arm A', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/a', active: true, code: 'AbC1234', ab: { enabled: true, variantBUrl: 'https://dest.example/b', splitPct: 0 } })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    await handler(event)
    const loc = new URL((globalThis as any).__h3.headers.location)
    expect(loc.origin + loc.pathname).toBe('https://dest.example/a')
    expect(loc.searchParams.get('xf_qr_variant')).toBe('A')
  })
  it('redirects to the bare destination when tagging is disabled', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x?keep=1', active: true, code: 'AbC1234', utmEnabled: false })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    await handler(event)
    expect((globalThis as any).__h3.headers.location).toBe('https://dest.example/x?keep=1')
  })
  it('404s for inactive codes without recording', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x', active: false })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    const body = await handler(event)
    expect(event.node.res.statusCode).toBe(404)
    expect(String(body)).toContain('no longer active')
    expect(record).not.toHaveBeenCalled()
  })
  it('404s malformed slugs without resolving', async () => {
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('bad')
    await handler(event)
    expect(resolve).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(404)
  })

  it('renders the hosted page in page mode and still records the scan', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x', active: true, code: 'AbC1234', mode: 'page' })
    loadPage.mockResolvedValue({ clientId: 'c', clientName: 'X', assets: {}, page: { id: 'p', config: { headline: 'Enter to win' } } })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    const html = await handler(event)
    expect(html).toContain('Enter to win')
    expect(record).toHaveBeenCalledOnce()
    expect(event.node.res.statusCode).toBe(200)
  })

  it('page mode with nothing published 404s rather than redirecting somewhere stale', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x', active: true, code: 'AbC1234', mode: 'page' })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    await handler(event)
    expect(event.node.res.statusCode).toBe(404)
  })

  it('preview renders drafts for staff without recording a scan', async () => {
    resolve.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://dest.example/x', active: true, code: 'AbC1234', mode: 'url' })
    loadPage.mockResolvedValue({ clientId: 'c', clientName: 'X', assets: {}, page: { id: 'p', config: { headline: 'Draft' } } })
    const handler = (await import('../../server/api/q/[code].get')).default
    const event = makeEvent('AbC1234')
    event.query = { xf_preview: '1' }
    const html = await handler(event)
    expect(html).toContain('Draft PREVIEW')
    expect(record).not.toHaveBeenCalled()
    expect(loadPage).toHaveBeenCalledWith(event, 'AbC1234', { includeDraft: true })
  })
})
