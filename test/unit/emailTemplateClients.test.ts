/* eslint-disable @typescript-eslint/no-explicit-any -- Mocked Nitro boundary. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))
  return { auth: vi.fn(), scope: vi.fn(), query: vi.fn(), get: vi.fn(), update: vi.fn() }
})
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.query }))
vi.mock('~~/server/utils/email-marketing/access', async (original) => ({ ...await original<any>(), resolveEmailClientScope: mocks.scope }))
vi.mock('~~/server/utils/email-marketing/templates', () => ({ getTemplate: mocks.get, updateTemplate: mocks.update }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
import choices from '../../server/api/email/template-clients.get'
import patch from '../../server/utils/email-marketing/templateUpdateHandler'
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const event = { context: {} } as any
let body: any
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('readBody', async () => body)
  vi.stubGlobal('getRouterParam', () => 'template')
  mocks.auth.mockResolvedValue({ id: 'user' })
  mocks.scope.mockResolvedValue([a])
  mocks.query.mockResolvedValue([{ id: a, name: 'Allowed' }])
  mocks.get.mockResolvedValue({ id: 'template', client_id: a })
  mocks.update.mockResolvedValue({ id: 'template' })
  body = { name: 'Updated' }
})
describe('template client choices and reassignment', () => {
  it('queries only active assigned IDs and minimal fields', async () => {
    expect(await choices(event)).toEqual({ clients: [{ id: a, name: 'Allowed' }], canUseSharedTemplates: false })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('SELECT id, name FROM agency_clients WHERE is_active = TRUE AND id = ANY($1::uuid[])'), [[a]])
  })
  it('allows shared only for all scope, including empty scope', async () => {
    mocks.scope.mockResolvedValueOnce([])
    expect((await choices(event)).canUseSharedTemplates).toBe(false)
    expect(mocks.query).toHaveBeenLastCalledWith(expect.any(String), [[]])
    mocks.scope.mockResolvedValueOnce('all')
    expect((await choices(event)).canUseSharedTemplates).toBe(true)
    expect(mocks.query).toHaveBeenLastCalledWith(expect.not.stringContaining('ANY'), [])
  })
  it('preserves omitted ownership and accepts authorized reassignment', async () => {
    await patch(event)
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('client_id')
    mocks.scope.mockResolvedValue([a, b])
    body.client_id = b
    await patch(event)
    expect(mocks.update.mock.calls[1][1]).toMatchObject({ client_id: b })
  })
  it('rejects cross-client targets, shared targets and foreign existing owners', async () => {
    body.client_id = b
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 403 })
    body.client_id = null
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.get.mockResolvedValue({ client_id: b })
    body.client_id = a
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('allows authorized shared reassignment and rejects invalid UUIDs', async () => {
    mocks.scope.mockResolvedValue('all')
    body.client_id = null
    await patch(event)
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ client_id: null })
    body.client_id = 'invalid'
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects unauthenticated requests before reading clients or templates', async () => {
    mocks.auth.mockRejectedValue(new Error('unauthorized'))
    await expect(choices(event)).rejects.toThrow('unauthorized')
    await expect(patch(event)).rejects.toThrow('unauthorized')
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
