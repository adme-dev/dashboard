import { beforeEach, describe, expect, it, vi } from 'vitest'
import post from '../../server/api/email/design/conditions.post'
import get from '../../server/api/email/design/conditions.get'
import { structuredDesign } from '../fixtures/email-design/structured'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  query: vi.fn(),
  body: vi.fn(),
  save: vi.fn(),
  cookie: 'token',
  headers: {} as Record<string, string>
}))
vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (f: unknown) => f,
  getCookie: () => mocks.cookie,
  getHeader: (_e: unknown, key: string) => mocks.headers[key],
  getQuery: () => ({ documentId: '10000000-0000-4000-8000-000000000001' }),
  setHeader: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: mocks.query,
  transactionWithoutRetry: vi.fn()
}))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({
  assertFreshDesignAccess: mocks.access
}))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({
  createEmailRenderer: () => ({})
}))
vi.mock(
  '~~/server/utils/email-marketing/designRevisions',
  async original => ({
    ...(await original<
      typeof import('../../server/utils/email-marketing/designRevisions')
    >()),
    saveDerivedTemplateDesignDraft: mocks.save
  })
)
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({
  ...(await original<
    typeof import('../../server/utils/email-marketing/designRequest')
  >()),
  readBoundedJson: mocks.body
}))
const id = '10000000-0000-4000-8000-000000000001'
const request = {
  documentId: id,
  expectedRevisionId: id,
  operationId: id,
  blockId: 'heading',
  condition: {
    version: 1,
    name: 'Known name',
    predicate: { field: 'first_name', op: 'exists' }
  }
}
const event = () =>
  ({
    context: {
      cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true' } }
    }
  }) as Parameters<typeof post>[0]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookie = 'token'
  mocks.headers = {
    'origin': 'https://app.xeroflow.io',
    'content-type': 'application/json'
  }
  mocks.session.mockResolvedValue({ id })
  mocks.access.mockResolvedValue('designer')
  mocks.body.mockResolvedValue(request)
  mocks.query.mockResolvedValue({
    payload: structuredDesign(),
    schema_version: 1,
    client_id: id,
    owner_client_id: id,
    template_kind: 'draft'
  })
  mocks.save.mockImplementation(async (input, authorize) => {
    await authorize(input.design.scope.clientId)
    return { documentId: id, revisionId: id }
  })
})
describe('dedicated condition discovery and mutation HTTP gates', () => {
  it('is feature-gated, session-authenticated and cross-origin protected', async () => {
    await expect(
      post({ context: {} } as Parameters<typeof post>[0])
    ).rejects.toMatchObject({ statusCode: 404 })
    mocks.session.mockResolvedValueOnce(null)
    await expect(post(event())).rejects.toMatchObject({ statusCode: 401 })
    mocks.headers.origin = 'https://attacker.invalid'
    await expect(post(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('derives actor and source, rejects staff/forged source/unknown conditions independently', async () => {
    await expect(post(event())).resolves.toEqual({
      documentId: id,
      revisionId: id
    })
    expect(mocks.save.mock.calls[0][0].actorId).toBe(id)
    mocks.save.mockClear()
    mocks.access.mockResolvedValueOnce('staff')
    await expect(post(event())).rejects.toMatchObject({ statusCode: 403 })
    mocks.body.mockResolvedValueOnce({ ...request, policy: {} })
    await expect(post(event())).rejects.toMatchObject({ statusCode: 400 })
    mocks.body.mockResolvedValueOnce({
      ...request,
      condition: {
        ...request.condition,
        predicate: { field: 'custom_offer', op: 'exists' }
      }
    })
    await expect(post(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('uses current server discovery and scoped access; staff gets read-only availability', async () => {
    await expect(get(event())).resolves.toEqual({ canEdit: true, clientId: id })
    mocks.access.mockResolvedValueOnce('staff')
    await expect(get(event())).resolves.toEqual({
      canEdit: false,
      clientId: id
    })
    mocks.access.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { statusCode: 403 })
    )
    await expect(get(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.access).toHaveBeenCalledWith('token', id, id, 'write')
  })
  it('keeps database failures content-free and retains server body-size errors', async () => {
    mocks.query.mockRejectedValueOnce(new Error('private SQL payload'))
    await expect(post(event())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'condition_save_unavailable'
    })
    mocks.body.mockRejectedValueOnce(
      Object.assign(new Error('large'), { statusCode: 413 })
    )
    await expect(post(event())).rejects.toMatchObject({ statusCode: 413 })
  })
})
