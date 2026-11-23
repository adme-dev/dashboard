import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), authority: vi.fn(), active: vi.fn(), client: vi.fn(), rows: vi.fn(), query: vi.fn(), header: vi.fn() }))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), getQuery: mocks.query, setHeader: mocks.header }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.rows }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: mocks.authority, isActiveGodModeAuthority: mocks.active }))
vi.mock('~~/server/utils/banner/clientAccess', () => ({ requireBannerClientAccess: mocks.client }))
const { default: handler } = await import('~~/server/api/agency/banner-studio/assets/import-recovery.get')
const clientId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'owner' })
  mocks.authority.mockResolvedValue({})
  mocks.active.mockReturnValue(true)
  mocks.query.mockReturnValue({ clientId, hashes: 'a'.repeat(64) })
  mocks.rows.mockResolvedValue([])
})
it('requires current owner authority before looking up recovery receipts', async () => {
  mocks.write.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }))
  await expect(handler({} as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.rows).not.toHaveBeenCalled()
})
it('bounds input, checks client access and queries only exact upload keys without mutations', async () => {
  await expect(handler({} as Parameters<typeof handler>[0])).resolves.toMatchObject({ canResume: false })
  expect(mocks.client).toHaveBeenCalledWith({}, clientId)
  expect(mocks.rows.mock.calls[0][0]).toMatch(/^SELECT /)
  expect(mocks.rows.mock.calls[0][1]).toEqual([[`thebrief-asset:${clientId}:${'a'.repeat(64)}`]])
  expect(mocks.header).toHaveBeenCalledWith({}, 'Cache-Control', 'private, no-store')
  mocks.query.mockReturnValue({ clientId, hashes: 'invalid' })
  await expect(handler({} as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 400 })
})

it('scopes staff receipt reads to the current actor and client without escalating roles', async () => {
  mocks.active.mockReturnValue(false)
  mocks.query.mockReturnValue({ clientId, hashes: 'a'.repeat(64), startedAt: '2026-11-23T00:00:00Z' })
  const get = vi.fn()
  const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { get } } } } }
  await expect(handler(event as Parameters<typeof handler>[0])).resolves.toMatchObject({ canResume: false, receipts: [] })
  expect(mocks.rows.mock.calls[0][1]).toEqual([clientId, 'owner', ['a'.repeat(64)]])
  expect(get).not.toHaveBeenCalled()
})
