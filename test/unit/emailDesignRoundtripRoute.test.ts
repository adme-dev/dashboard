import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/roundtrip.post'
import { structuredDesign } from '../fixtures/email-design/structured'
import { validateDesignAction } from '../../shared/emailRendering/designActions'

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), execute: vi.fn(), body: vi.fn(), headers: {} as Record<string, string> }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (f: unknown) => f, getCookie: () => 'token', getHeader: (_e: unknown, key: string) => mocks.headers[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access }))
vi.mock('~~/server/utils/email-marketing/designHandoffs', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designHandoffs')>()), executeDesignRoundtrip: mocks.execute }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designRequest')>()), readBoundedJson: mocks.body }))
const id = '10000000-0000-4000-8000-000000000001'
const event = () => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' } } } }) as Parameters<typeof handler>[0]
describe('durable FigFlow handoff HTTP boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.headers = { origin: 'https://app.xeroflow.io', 'content-type': 'application/json' }
    mocks.session.mockResolvedValue({ id })
    mocks.access.mockResolvedValue('designer')
    mocks.body.mockResolvedValue({ command: 'open', operationId: id, draftId: id, expectedRevisionId: id })
    mocks.execute.mockImplementation(async (_request, authority) => { await authority.authorize(null, 'write'); return { handoff: { id } } })
  })
  it('derives actor from the validated session and passes fresh authority to the transaction', async () => {
    expect(await handler(event())).toEqual({ handoff: { id } })
    expect(mocks.execute.mock.calls[0][1].actorId).toBe(id)
    expect(mocks.access).toHaveBeenCalledWith('token', id, null, 'write')
  })
  it('keeps the private feature disabled and rejects expired sessions', async () => {
    await expect(handler({ context: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
    mocks.session.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects cross-origin requests and actor forgery before service execution', async () => {
    mocks.headers.origin = 'https://attacker.example'
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    mocks.headers.origin = 'https://app.xeroflow.io'
    mocks.body.mockResolvedValue({ command: 'resume', handoffId: id, actorId: id })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('accepts template proposals only through the template handoff boundary and rejects command mismatch', async () => {
    const design = structuredDesign()
    const action = { version: 1, action: 'propose-return', operationId: id, scope: design.scope, draftId: id, baseRevisionId: id, design }
    expect(() => validateDesignAction(action)).toThrow('INVALID_ACTION')
    mocks.body.mockResolvedValue({ command: 'propose', handoffId: id, action })
    expect(await handler(event())).toEqual({ handoff: { id } })
    mocks.body.mockResolvedValue({ command: 'apply', handoffId: id, action })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
  })
  it('redacts database failures and preserves body bounds', async () => {
    mocks.execute.mockRejectedValue(new Error('private SQL payload'))
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503, statusMessage: 'design_handoff_unavailable' })
    mocks.body.mockRejectedValue(Object.assign(new Error('large'), { statusCode: 413 }))
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 413 })
  })
})
