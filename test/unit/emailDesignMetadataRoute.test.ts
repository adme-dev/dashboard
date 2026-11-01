import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/drafts/[id]/metadata.patch'
import { DesignRevisionError } from '../../server/utils/email-marketing/designRevisions'
import { EmailDesignError } from '../../shared/emailRendering/designContract'

const id = '10000000-0000-4000-8000-000000000001'
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  save: vi.fn(),
  body: vi.fn(),
  gate: vi.fn()
}))
vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (f: unknown) => f,
  getCookie: () => 'token',
  getHeader: () => undefined,
  getRouterParam: () => '10000000-0000-4000-8000-000000000001',
  setHeader: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({
  assertFreshDesignAccess: mocks.access
}))
vi.mock('~~/server/utils/email-marketing/designMetadata', () => ({
  saveTemplateDraftMetadata: mocks.save
}))
vi.mock('~~/server/utils/email-marketing/designRequest', () => ({
  readBoundedJson: mocks.body,
  assertDesignMutationRequest: mocks.gate
}))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({
  createEmailRenderer: () => ({})
}))
const event = () =>
  ({
    context: {
      cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' } }
    }
  }) as Parameters<typeof handler>[0]
const body = () => ({
  version: 1,
  operationId: id,
  expectedRevisionId: id,
  scope: { clientId: null },
  subject: 'Subject',
  previewText: null
})
describe('draft metadata route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.mockResolvedValue({ id })
    mocks.access.mockResolvedValue('staff')
    mocks.body.mockResolvedValue(body())
    mocks.save.mockImplementation(
      async (_input, authorize, _renderer, _transaction, moduleRead) => {
        await authorize(null)
        await moduleRead(id, null)
        return { documentId: id, revisionId: id }
      }
    )
  })
  it('lets authorized staff edit metadata using the server actor and fresh module reads', async () => {
    expect(await handler(event())).toMatchObject({
      draftId: id,
      revisionId: id,
      published: false
    })
    expect(mocks.save.mock.calls[0][0]).toEqual({
      documentId: id,
      actorId: id,
      operationId: id,
      expectedRevisionId: id,
      expectedClientId: null,
      subject: 'Subject',
      previewText: null
    })
    expect(mocks.access).toHaveBeenCalledWith('token', id, null, 'read')
    expect(mocks.body).toHaveBeenCalledWith(expect.anything(), 4096)
  })
  it('stays disabled and rejects expired sessions', async () => {
    await expect(
      handler({ context: {} } as Parameters<typeof handler>[0])
    ).rejects.toMatchObject({ statusCode: 404 })
    mocks.session.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects structural payloads and oversized metadata', async () => {
    mocks.body.mockResolvedValue({ ...body(), design: {} })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    mocks.body.mockResolvedValue({ ...body(), subject: 'x'.repeat(301) })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('preserves null and empty values at the 300-character limit', async () => {
    mocks.body.mockResolvedValue({ ...body(), subject: null, previewText: '' })
    await handler(event())
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      subject: null,
      previewText: ''
    })
    mocks.body.mockResolvedValue({ ...body(), subject: 'x'.repeat(300) })
    await expect(handler(event())).resolves.toMatchObject({ published: false })
  })
  it('does not save when request admission or write authority fails', async () => {
    mocks.gate.mockImplementation(() => {
      throw Object.assign(new Error('denied'), { statusCode: 403 })
    })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.body).not.toHaveBeenCalled()
    mocks.gate.mockReset()
    mocks.access.mockRejectedValue(
      Object.assign(new Error('revoked'), { statusCode: 403 })
    )
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each([
    ['LIMIT_EXCEEDED', 413],
    ['EDIT_FORBIDDEN', 403],
    ['POLICY_CHANGE_FORBIDDEN', 403],
    ['INVALID_DESIGN', 400]
  ] as const)('maps design failure %s without reporting an outage', async (code, statusCode) => {
    mocks.save.mockRejectedValue(new EmailDesignError(code, 'private detail'))
    await expect(handler(event())).rejects.toMatchObject({ statusCode, statusMessage: code })
  })
  it('maps conflicts and hides unexpected storage errors', async () => {
    mocks.save.mockRejectedValue(new DesignRevisionError('REVISION_CONFLICT'))
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'REVISION_CONFLICT'
    })
    mocks.save.mockRejectedValue(new Error('private SQL'))
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'design_metadata_unavailable'
    })
  })
})
