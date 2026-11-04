import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ one: vi.fn(), validate: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.one, queryRowsFresh: vi.fn(async () => []) }))
vi.mock('~~/server/utils/auth', () => ({ acceptGodModeInternalExecution: async () => null, validateSession: mocks.validate, TransientAuthError: class extends Error {} }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: vi.fn() }))
vi.mock('~~/server/utils/permissions', () => ({ isReadOnlyRole: () => false }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRequestURL', (event: { path: string }) => new URL(event.path, 'https://app.xeroflow.test'))
vi.stubGlobal('getRouterParam', (event: { path: string }) => event.path.split('/').at(-1))
vi.stubGlobal('getHeader', () => undefined)
vi.stubGlobal('getCookie', () => undefined)
vi.stubGlobal('setHeader', vi.fn())
const auth = (await import('~~/server/middleware/auth')).default
const preview = (await import('~~/server/api/public/banner-share/[token].get')).default
const path = `/api/public/banner-share/p_${'a'.repeat(32)}`
const event = (url = path, method = 'GET') => ({ path: url, method, context: {} }) as never
beforeEach(() => {
  mocks.one.mockReset()
  mocks.validate.mockReset()
})

describe('client preview without a staff session', () => {
  it.each(['GET', 'HEAD'])('lets an exact %s preview reach its token checks', async (method) => {
    await expect(auth(event(path, method))).resolves.toBeUndefined()
    expect(mocks.validate).not.toHaveBeenCalled()
  })
  it('returns the shared artwork through both boundaries for an active link', async () => {
    mocks.one.mockResolvedValueOnce({ projectId: 'project', revoked: false, expiresAt: '2099-01-01' })
      .mockResolvedValueOnce({ id: 'project', name: 'Shared artwork', canvasData: { mrec: { layers: [] } } })
    await auth(event())
    expect(await preview(event())).toMatchObject({ project: { id: 'project' }, fonts: [] })
  })
  it.each([
    [null, 404],
    [{ projectId: 'project', revoked: true, expiresAt: '2099-01-01' }, 410],
    [{ projectId: 'project', revoked: false, expiresAt: '2020-01-01' }, 410]
  ])('still rejects an unknown, revoked or expired link', async (link, statusCode) => {
    mocks.one.mockResolvedValueOnce(link)
    await auth(event())
    await expect(preview(event())).rejects.toMatchObject({ statusCode })
    expect(mocks.one).toHaveBeenCalledTimes(1)
  })
  it.each([
    [path, 'POST'], [path, 'DELETE'], [`${path}/comments`, 'GET'],
    ['/api/public/banner-share', 'GET'], ['/api/public/banner-share/p_bad', 'GET'],
    ['/api/agency/banner-studio/links', 'GET'], ['/api/agency/banner-studio/projects', 'GET']
  ])('retains staff authentication for %s %s', async (url, method) => {
    await expect(auth(event(url, method))).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.one).not.toHaveBeenCalled()
  })
})
