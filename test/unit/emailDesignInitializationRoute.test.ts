import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/drafts/initialize.post'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  initialize: vi.fn(),
  body: vi.fn(),
  headers: {} as Record<string, string>
}))
vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (f: unknown) => f,
  getCookie: () => 'token',
  getHeader: (_e: unknown, key: string) => mocks.headers[key],
  setHeader: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({
  assertFreshDesignAccess: mocks.access
}))
vi.mock('~~/server/utils/email-marketing/designInitialization', () => ({
  initializeTemplateDesignDraft: mocks.initialize
}))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({
  ...(await original<
    typeof import('../../server/utils/email-marketing/designRequest')
  >()),
  readBoundedJson: mocks.body
}))
const id = '10000000-0000-4000-8000-000000000001'
const event = () =>
  ({
    context: {
      cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' } }
    }
  }) as Parameters<typeof handler>[0]
describe('explicit draft initialization route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.headers = {
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    }
    mocks.session.mockResolvedValue({ id })
    mocks.access.mockResolvedValue('designer')
    mocks.body.mockResolvedValue({
      version: 1,
      templateId: id,
      scope: { clientId: null }
    })
    mocks.initialize.mockImplementation(async (_input, authorize) => {
      await authorize(null)
      return {
        documentId: id,
        revisionId: id,
        schemaVersion: 0,
        origin: 'legacy'
      }
    })
  })
  it('returns a legacy locator using server actor and rechecks permission under lock', async () => {
    expect(await handler(event())).toEqual({
      version: 1,
      draftId: id,
      revisionId: id,
      schemaVersion: 0,
      origin: 'legacy',
      published: false
    })
    expect(mocks.initialize).toHaveBeenCalledWith(
      { templateId: id, actorId: id, expectedClientId: null },
      expect.any(Function)
    )
    expect(mocks.access).toHaveBeenCalledTimes(2)
    expect(mocks.body).toHaveBeenCalledWith(expect.anything(), 4096)
  })
  it('returns structured head metadata without changing the locator', async () => {
    mocks.initialize.mockImplementation(async (_input, authorize) => {
      await authorize(null)
      return {
        documentId: id,
        revisionId: id,
        schemaVersion: 1,
        origin: 'design'
      }
    })
    expect(await handler(event())).toEqual({
      version: 1,
      draftId: id,
      revisionId: id,
      schemaVersion: 1,
      origin: 'design',
      published: false
    })
  })
  it('remains disabled by default', async () => {
    await expect(
      handler({ context: {} } as Parameters<typeof handler>[0])
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('rejects expired sessions', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('rejects staff and authority revoked after admission', async () => {
    mocks.access.mockResolvedValue('staff')
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.initialize).not.toHaveBeenCalled()
    mocks.access.mockResolvedValueOnce('designer')
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects cross-origin and form submissions', async () => {
    mocks.headers.origin = 'https://attacker.example'
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    delete mocks.headers.origin
    mocks.headers['content-type'] = 'text/plain'
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 415 })
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('rejects forged actor fields and preserves bounded reader errors', async () => {
    mocks.body.mockResolvedValue({
      version: 1,
      templateId: id,
      scope: { clientId: null },
      actorId: id
    })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    mocks.body.mockRejectedValue(
      Object.assign(new Error('large'), { statusCode: 413 })
    )
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 413 })
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('redacts unexpected storage failures', async () => {
    mocks.initialize.mockRejectedValue(new Error('private SQL'))
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'design_initialization_unavailable'
    })
  })
  it('fails closed for an invalid app origin even when the request omits Origin', async () => {
    const configured = event()
    Object.assign(configured.context.cloudflare!.env, {
      FIGFLOW_EDM_APP_ORIGIN: 'https://app.xeroflow.io/path'
    })
    delete mocks.headers.origin
    await expect(handler(configured)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'design_origin_unavailable'
    })
    expect(mocks.body).not.toHaveBeenCalled()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('rejects cross-site browser requests without Origin before reading their body', async () => {
    delete mocks.headers.origin
    mocks.headers['sec-fetch-site'] = 'cross-site'
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'design_origin_denied'
    })
    expect(mocks.body).not.toHaveBeenCalled()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })
})
