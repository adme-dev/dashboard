import { describe, it, expect, vi } from 'vitest'
vi.mock('~~/server/utils/qr/access', () => ({
  requireQrCodeAccess: vi.fn().mockResolvedValue({ user: {}, row: { id: '1', code: 'AbC1234', name: 'Front door', style: { pattern: 'rounded' } } }),
  shortUrl: (c: string) => `https://app.xeroflow.io/q/${c}`,
}))

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: any, key: string) => string | undefined
  getQuery: (event: any) => Record<string, unknown>
  setResponseHeaders: (event: any, headers: Record<string, string>) => void
}
testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = () => ({})
testGlobal.setResponseHeaders = (event, headers) => {
  for (const [k, v] of Object.entries(headers)) event.node.res.setHeader(k, v)
}

describe('export.svg', () => {
  it('returns a self-contained svg as attachment', async () => {
    const svgHandler = (await import('../../server/api/agency/qr-codes/[id]/export.svg.get')).default
    const headers: Record<string, string> = {}
    const event: any = { context: { params: { id: '1' } }, node: { res: { setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v }, statusCode: 200 } } }
    const body = await svgHandler(event)
    expect(String(body)).toContain('<svg')
    expect(headers['content-type']).toContain('image/svg+xml')
    expect(headers['content-disposition']).toContain('front-door-AbC1234.svg')
  })
})
