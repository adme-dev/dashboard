import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const mocks = vi.hoisted(() => ({ manager: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), read: vi.fn(), resolve: vi.fn(), body: {} as Record<string, unknown>, id: 'module', token: 'token' as string | null }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), getCookie: () => mocks.token, getHeader: () => null }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: async () => ({ id: 'actor' }) }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignPublisher: mocks.manager }))
vi.mock('~~/server/utils/email-marketing/access', () => ({ resolveEmailWriteClientId: mocks.resolve, assertEmailClientAccess: async () => {} }))
vi.mock('~~/server/utils/email-marketing/customModules', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/customModules')>()), createCustomModule: mocks.create, updateCustomModule: mocks.update, deleteCustomModule: mocks.remove, getCustomModule: mocks.read }))
vi.stubGlobal('defineEventHandler', (f: unknown) => f)
vi.stubGlobal('createError', createError)
vi.stubGlobal('readBody', async () => mocks.body)
vi.stubGlobal('getRouterParam', () => mocks.id)
const post = (await import('../../server/api/agency/email/modules/index.post')).default
const patch = (await import('../../server/api/agency/email/modules/[id].patch')).default
const remove = (await import('../../server/api/agency/email/modules/[id].delete')).default
const event = { context: {} } as Parameters<typeof post>[0]
describe('legacy modules retain canonical publisher authority', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.token = 'token'
    mocks.body = { name: 'Saved section', blocks: { blocks: { text: { type: 'Text', data: { props: { text: 'Copy' } } } }, rootChildrenIds: ['text'] } }
    mocks.resolve.mockResolvedValue('server-resolved-client')
    mocks.read.mockResolvedValue({ id: 'legacy-id', client_id: 'stored-client', design_document_id: null })
    mocks.create.mockResolvedValue({ id: 'new-id' })
    mocks.update.mockResolvedValue({ id: 'legacy-id' })
  })
  it.each([['create', post], ['rename', patch], ['delete', remove]] as const)('rejects %s for ordinary write users before mutation', async (_name, handler) => {
    mocks.manager.mockRejectedValue(createError({ statusCode: 403, statusMessage: 'design_access_denied' }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('checks create against the server-resolved scope and mutation actor, ignoring browser role claims', async () => {
    mocks.body.role = 'admin'
    await expect(post(event)).resolves.toEqual({ module: { id: 'new-id' } })
    expect(mocks.manager).toHaveBeenCalledWith('token', 'actor', 'server-resolved-client')
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ created_by: 'actor', client_id: 'server-resolved-client' })
  })
  it('retains mutable legacy IDs but checks stored target scope on metadata/delete and rejects canonical rows', async () => {
    await expect(patch(event)).resolves.toEqual({ module: { id: 'legacy-id' } })
    await expect(remove(event)).resolves.toEqual({ ok: true })
    expect(mocks.manager).toHaveBeenCalledWith('token', 'actor', 'stored-client')
    mocks.read.mockResolvedValue({ id: 'legacy-id', client_id: null, design_document_id: 'canonical' })
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 409 })
    await expect(remove(event)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('fails closed when the previously cached write actor has no validated session token', async () => {
    mocks.token = null
    await expect(post(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.manager).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
