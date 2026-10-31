import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), auth: vi.fn(), write: vi.fn(), header: vi.fn(), body: { projectId: 'project', name: 'Saved set', tags: [] } }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.rows, queryOneFresh: mocks.one }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('setHeader', mocks.header)
vi.stubGlobal('readBody', async () => mocks.body)
const { default: native } = await import('../../server/api/agency/banner-studio/templates/index.get')
const { default: html } = await import('../../server/api/agency/banner-studio/custom-templates/index.get')
const { default: capture } = await import('../../server/api/agency/banner-studio/templates/from-project.post')
beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.mockResolvedValue([])
  mocks.write.mockResolvedValue({ id: 'creator' })
  mocks.one.mockReset()
})
it.each([native, html])('reads the gallery freshly and disables HTTP caching', async (handler) => {
  await handler({} as never)
  expect(mocks.auth).toHaveBeenCalledTimes(1)
  expect(mocks.rows).toHaveBeenCalledTimes(1)
  expect(mocks.header).toHaveBeenCalledWith({}, 'Cache-Control', 'private, no-store')
})
it('captures every current saved layout through a fresh project read', async () => {
  const canvas = { mrec: { layers: [] }, custom_1200x1200: { layers: [], playback: { duration: 12, loopCount: 2 } } }
  mocks.one.mockResolvedValueOnce({ canvasData: JSON.stringify(canvas), thumbnailUrl: null }).mockResolvedValueOnce({ id: 'template' })
  expect(await capture({} as never)).toEqual({ id: 'template' })
  expect(mocks.one.mock.calls[1]![1][2]).toBe(JSON.stringify(canvas))
  expect(mocks.one.mock.calls[1]![1][6]).toEqual(['mrec', 'custom_1200x1200'])
})
it('does not snapshot a template for a read-only caller', async () => {
  mocks.write.mockRejectedValueOnce({ statusCode: 403 })
  await expect(capture({} as never)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.one).not.toHaveBeenCalled()
})
