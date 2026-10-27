import { beforeEach, describe, expect, it, vi } from 'vitest'
const readFile = vi.hoisted(() => vi.fn())
vi.mock('fs', () => ({ promises: { readFile } }))
import handler from '~~/server/api/_uploads/[...path].get'
function event(path: string): any {
  const headers = new Map()
  return { context: { params: { path } }, node: { req: { method: 'GET' }, res: {
    setHeader: (key: string, value: string) => headers.set(key, value), getHeader: (key: string) => headers.get(key),
  } } }
}
beforeEach(() => { readFile.mockReset(); readFile.mockResolvedValue(Buffer.from('qr-image')) })
describe('local namespace exclusion', () => {
  it.each(['banner-dissector/job/original.png', 'BANNER-DISSECTOR/job/original.png', 'scoped-dissection-assets/a.png','scoped-banner-exports/a.png', 'scoped-banner-exports/a.json',
    '%73coped-dissection-assets/a.png','%2573coped-dissection-assets/a.png', '/scoped-dissection-assets/a.png',
    'foo/../scoped-dissection-assets/a.png', 'foo/..scoped-dissection-assets/a.png', 'SCOPED-DISSECTION-ASSETS/a.png',
    'scoped-dissection-assets\\a.png', 'foo/%2e%2e/scoped-banner-exports/a.png'])('rejects %s before filesystem read', async path => {
      const e = event(path)
      await expect(handler(e)).rejects.toMatchObject({ statusCode: 404 })
      expect(readFile).not.toHaveBeenCalled()
      expect(e.node.res.getHeader('Cache-Control')).toBe('private, no-store')
    })
  it('retains ordinary legacy and QR local reads', async () => {
    const e = event('banner-assets/uploader/uuid/qr.png')
    expect(await handler(e)).toEqual(Buffer.from('qr-image'))
    expect(e.node.res.getHeader('Cache-Control')).toBe('public, max-age=3600')
  })
})
