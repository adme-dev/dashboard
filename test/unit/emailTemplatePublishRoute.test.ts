import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/templates.post'
import { libraryHarness, actorId, draftId, templateId, initial } from '../helpers/emailDesignLibrary'
import { emailRendererEnv } from '../fixtures/emailRenderer'
const mocks = vi.hoisted(() => ({ h: null as ReturnType<typeof libraryHarness> | null, body: {} as Record<string, unknown>, denied: false }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (fn: unknown) => fn,
  getCookie: () => 'token', getHeader: (_e: unknown, key: string) => ({ origin: 'https://app.xeroflow.io', 'content-type': 'application/json' })[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: async () => ({ id: actorId }) }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: (cb: Parameters<ReturnType<typeof libraryHarness>['transaction']>[0]) => mocks.h!.transaction(cb) }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: async () => {
  if (mocks.denied) throw Object.assign(new Error('denied'), { statusCode: 403 }); return 'designer'
}, assertFreshDesignPublisher: async () => { if (mocks.denied) throw Object.assign(new Error('denied'), { statusCode: 403 }) } }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designRequest')>()), readBoundedJson: async () => mocks.body }))
const env = () => ({ ...emailRendererEnv, EMAIL_DESIGN_ENVIRONMENT: 'production', EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1', FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED: 'true' })
const event = (vars = env()) => ({ context: { cloudflare: { env: vars } } }) as Parameters<typeof handler>[0]
const publish = () => ({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId, expectedRevisionId: initial, name: 'Reviewed template', category: null, includedOverridePaths: [] })
beforeEach(() => { mocks.h = libraryHarness(); mocks.body = publish(); mocks.denied = false })
describe('narrow publish route through the existing transactional owner', () => {
  it('returns exact immutable readback, leaves original intact and replays one publication', async () => {
    const before = structuredClone(mocks.h!.state.templates[templateId])
    const result = await handler(event())
    expect(result).toMatchObject({ published: true, publication: { templateId: result!.templateId, documentId: result!.documentId, revisionId: result!.revisionId, design: mocks.h!.state.revisions[initial].payload } })
    expect(result!.templateId).not.toBe(templateId)
    expect(result!.documentId).not.toBe(draftId)
    expect(await handler(event())).toEqual(result)
    expect(Object.values(mocks.h!.state.templates).filter(t => t.template_kind === 'template')).toHaveLength(1)
    expect(mocks.h!.state.templates[templateId]).toEqual(before)
    expect(mocks.h!.state.campaigns).toEqual({ sent: 'frozen sent html', scheduled: 'frozen scheduled html' })
    mocks.body = { ...mocks.body, name: 'Changed intent' }
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409, statusMessage: 'IDEMPOTENCY_CONFLICT' })
  })
  it.each(['copy-template-draft', 'revise-template'])('never admits %s through the narrow gate', async command => {
    mocks.body = command === 'copy-template-draft'
      ? { version: 1, command, operationId: crypto.randomUUID(), templateId, revisionId: initial, expectedSourceHeadRevisionId: initial, clientId: null, name: 'Copy', category: null }
      : { ...publish(), command, templateId, expectedTemplateRevisionId: initial }
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.h!.queries).toHaveLength(0)
  })
  it('rejects forged scope/actor, disabled gate, and fresh revoked rights without creating owners', async () => {
    mocks.body = { ...publish(), actorId, clientId: crypto.randomUUID() }
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    mocks.body = publish()
    await expect(handler(event({ ...env(), FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED: 'false' }))).rejects.toMatchObject({ statusCode: 404 })
    mocks.denied = true
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(Object.keys(mocks.h!.state.templates)).toEqual([templateId])
  })
  it('reports a post-commit readback denial as uncertain, never as a definite rejected publication', async () => {
    const transaction = mocks.h!.transaction
    let calls = 0
    mocks.h!.transaction = async callback => {
      const result = await transaction(callback)
      if (++calls === 1) mocks.denied = true
      return result
    }
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503, statusMessage: 'design_library_outcome_unknown' })
    expect(Object.values(mocks.h!.state.templates).filter(t => t.template_kind === 'template')).toHaveLength(1)
    mocks.denied = false
    const result = await handler(event())
    expect(result).toMatchObject({ published: true })
    expect(Object.values(mocks.h!.state.templates).filter(t => t.template_kind === 'template')).toHaveLength(1)
  })
  it('rejects stale heads and publication from a non-draft owner', async () => {
    mocks.body = { ...publish(), expectedRevisionId: crypto.randomUUID() }
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409, statusMessage: 'REVISION_CONFLICT' })
    mocks.body = publish()
    mocks.h!.state.templates[templateId].template_kind = 'template'
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409, statusMessage: 'TEMPLATE_DRAFT_REQUIRED' })
    expect(Object.keys(mocks.h!.state.templates)).toEqual([templateId])
  })
})
