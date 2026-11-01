import { beforeEach, describe, expect, it, vi } from 'vitest'
import { structuredDesign } from '../fixtures/email-design/structured'
import handler from '../../server/api/email/design/drafts/[id].patch'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  save: vi.fn(),
  staff: vi.fn(),
  query: vi.fn(),
  body: '',
  headers: {} as Record<string, string>,
  responseHeader: vi.fn(),
  cookie: 'token',
  id: '20000000-0000-4000-8000-000000000001'
}))
vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (f: unknown) => f,
  getCookie: () => mocks.cookie,
  getHeader: (_event: unknown, key: string) => mocks.headers[key],
  setHeader: mocks.responseHeader,
  getRouterParam: () => mocks.id,
  getRequestWebStream: () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(mocks.body))
        c.close()
      }
    })
}))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query }))
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
    saveTemplateDesignDraft: mocks.save,
    saveStaffTemplateDesignDraft: mocks.staff
  })
)
const event = () =>
  ({
    context: {
      cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' } }
    }
  }) as Parameters<typeof handler>[0]
describe('gated versioned template draft route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookie = 'token'
    mocks.headers = {
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    }
    mocks.session.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001'
    })
    mocks.access.mockResolvedValue('designer')
    mocks.save.mockResolvedValue({ documentId: mocks.id, revisionId: mocks.id })
    mocks.staff.mockResolvedValue({
      documentId: mocks.id,
      revisionId: mocks.id
    })
    mocks.query.mockResolvedValue({ created_at: '2026-10-31T00:00:00Z' })
    mocks.body = JSON.stringify({
      version: 1,
      operationId: mocks.id,
      action: 'save-draft',
      scope: structuredDesign().scope,
      draftId: mocks.id,
      expectedRevisionId: mocks.id,
      design: structuredDesign()
    })
  })
  it('is disabled unless explicitly enabled', async () => {
    await expect(
      handler({ context: {} } as Parameters<typeof handler>[0])
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('returns a stable unpublished receipt and derives actor/mode server-side', async () => {
    expect(await handler(event())).toMatchObject({
      action: 'save-draft',
      published: false,
      savedAt: '2026-10-31T00:00:00.000Z'
    })
    expect(mocks.save.mock.calls[0][0].actorId).toBe(
      '10000000-0000-4000-8000-000000000001'
    )
    mocks.access.mockResolvedValue('staff')
    await expect(
      mocks.save.mock.calls[0][1](structuredDesign().scope.clientId)
    ).rejects.toMatchObject({ statusCode: 403 })
  })
  it('uses the staff boundary for ordinary editors', async () => {
    mocks.access.mockResolvedValue('staff')
    await handler(event())
    expect(mocks.staff).toHaveBeenCalledOnce()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects a forged actor or mismatched target', async () => {
    const input = JSON.parse(mocks.body)
    mocks.body = JSON.stringify({ ...input, actorId: mocks.id })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    mocks.body = JSON.stringify({
      ...input,
      draftId: '30000000-0000-4000-8000-000000000001'
    })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects revoked sessions and oversized request streams', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    mocks.session.mockResolvedValue({ id: mocks.id })
    mocks.body = 'x'.repeat(2200000)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 413 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects cross-origin and form submissions before authorizing or saving', async () => {
    mocks.headers.origin = 'https://attacker.example'
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'design_origin_denied'
    })
    delete mocks.headers.origin
    mocks.headers['content-type'] = 'text/plain'
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 415,
      statusMessage: 'json_required'
    })
    expect(mocks.session).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects cross-site fetch metadata with no origin and never caches receipts', async () => {
    delete mocks.headers.origin
    mocks.headers['sec-fetch-site'] = 'cross-site'
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.responseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'cache-control',
      'no-store'
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('honors only the explicit configured app origin', async () => {
    const staged = event()
    Object.assign(staged.context.cloudflare!.env, {
      FIGFLOW_EDM_APP_ORIGIN: 'https://staging.xeroflow.io'
    })
    await expect(handler(staged)).rejects.toMatchObject({ statusCode: 403 })
    mocks.headers.origin = 'https://staging.xeroflow.io'
    await expect(handler(staged)).resolves.toMatchObject({ published: false })
  })
})
