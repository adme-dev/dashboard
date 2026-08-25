import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolve, record } = vi.hoisted(() => ({ resolve: vi.fn(), record: vi.fn() }))
vi.mock('~~/server/utils/qr/resolve', () => ({ resolveQrCode: resolve }))
vi.mock('~~/server/utils/qr/scans', () => ({ recordScan: record }))

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: any, key: string) => string | undefined
  setResponseStatus: (event: any, status: number) => void
  setResponseHeaders: (event: any, headers: Record<string, string>) => void
  sendRedirect: (event: any, location: string, status: number) => void
}

testGlobal.defineEventHandler = fn => fn
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
    method: 'GET',
  }
  ;(globalThis as any).__h3 = { event, headers, get status() { return event.node.res.statusCode } }
  return event
}
beforeEach(() => vi.clearAllMocks())

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
})
