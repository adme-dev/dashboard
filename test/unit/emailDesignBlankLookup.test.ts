import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/roundtrip.post'
import { createEmptyDocument } from '../../app/types/edm'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { nonBlankBodies } from '../fixtures/email-design/blank'
import type { DesignDb } from '../../server/utils/email-marketing/designReads'

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), body: vi.fn(), execute: vi.fn() }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (f: unknown) => f, getCookie: () => 'token', getHeader: (_e: unknown, key: string) => ({ origin: 'https://app.xeroflow.io', 'content-type': 'application/json' })[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access, assertFreshDesignPublisher: vi.fn() }))
vi.mock('~~/server/utils/email-marketing/designHandoffs', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designHandoffs')>()), executeDesignRoundtrip: mocks.execute }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designRequest')>()), readBoundedJson: mocks.body }))
const id = '10000000-0000-4000-8000-000000000001'
const clientId = '20000000-0000-4000-8000-000000000001'
const event = (enabled = true) => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'false', FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: String(enabled), FIGFLOW_EDM_LIBRARY_ENABLED: 'true', FIGFLOW_EDM_BRAND_ENABLED: 'true' } } } }) as unknown as Parameters<typeof handler>[0]

describe('E01 persisted blank lookup through HTTP and real discovery owner', () => {
  let body: unknown
  let schema: null | 0 | 1
  let changed: boolean
  let kind: string
  let scope: string | null
  let campaign: boolean
  let queries: string[]
  beforeEach(async () => {
    vi.resetAllMocks()
    body = createEmptyDocument(); schema = null; changed = false; kind = 'draft'; scope = clientId; campaign = false; queries = []
    mocks.session.mockResolvedValue({ id })
    mocks.access.mockResolvedValue('designer')
    mocks.body.mockImplementation(() => campaign ? { command: 'lookup', owner: { kind: 'campaign', id } } : { command: 'lookup', templateId: id })
    const actual = await vi.importActual<typeof import('../../server/utils/email-marketing/designHandoffs')>('../../server/utils/email-marketing/designHandoffs')
    const db: DesignDb = { query: async (sql) => {
      queries.push(sql)
      if (sql.includes('FROM campaigns WHERE')) return { rows: [{ id, client_id: scope, status: 'draft' }] }
      if (sql.includes('FROM edm_templates WHERE')) return { rows: [{ id, client_id: scope, template_kind: kind, body_source: body }] }
      if (sql.startsWith('SELECT id FROM email_design_documents')) return { rows: schema === null ? [] : [{ id }] }
      if (sql.includes('SELECT d.id AS document_id')) return { rows: [{ document_id: id, template_id: id, document_client_id: scope, template_client_id: scope, template_kind: kind, head_revision_id: id, schema_version: schema, payload: schema === 1 ? composerToDesignDraft(body, scope) : {}, payload_text: '{}', projection_revision_id: null, projection_source: body, legacy_changed: changed }] }
      throw new Error(`Unexpected discovery query: ${sql}`)
    } }
    mocks.execute.mockImplementation((request, authority, renderer) => actual.executeDesignRoundtrip(request, authority, renderer, callback => callback(db)))
  })
  it.each([null, 0] as const)('advertises the exact blank at schema %s without inventing a persisted structured baseline', async (version) => {
    schema = version
    const result = await handler(event())
    expect(result).toMatchObject({ designerAuthoring: { available: true, capabilities: { version: 1 } }, libraryAuthoring: { available: false } })
    expect(result).not.toHaveProperty('blankDesignerSource')
    expect(result).toHaveProperty('draft', version === null ? null : expect.objectContaining({ state: 'legacy', ownerChangedSinceSnapshot: false }))
    expect(queries.every(sql => sql.startsWith('SELECT'))).toBe(true)
    expect(mocks.access).toHaveBeenLastCalledWith('token', id, clientId, 'write')
  })
  it('accepts reordered raw blank keys through persisted discovery', async () => {
    body = { root: { data: { childrenIds: [], props: { fontFamily: 'MODERN_SANS', textColor: '#262626', canvasColor: '#FFFFFF', backdropColor: '#F5F5F5' } }, type: 'EmailLayout' } }
    expect(await handler(event())).toMatchObject({ draft: null, designerAuthoring: { available: true } })
  })
  it.each(nonBlankBodies())('does not advertise malformed/nonblank raw body: %s', async (_name, candidate) => {
    body = candidate
    for (const version of [null, 0] as const) {
      schema = version
      expect(await handler(event())).toMatchObject({ designerAuthoring: { available: false, capabilities: null } })
      expect(mocks.access.mock.calls.every(call => call[3] === 'read')).toBe(true)
    }
  })
  it('uses schema0 whole-owner drift, not only the matching body', async () => {
    schema = 0; changed = true
    expect(await handler(event())).toMatchObject({ designerAuthoring: { available: false } })
  })
  it('never treats published or campaign raw blanks as E01 eligible', async () => {
    kind = 'template'
    expect(await handler(event())).toMatchObject({ designerAuthoring: { available: false } })
    kind = 'draft'; campaign = true
    expect(await handler(event())).toMatchObject({ draft: null, designerAuthoring: { available: false }, campaignAuthoring: { available: false, contentImagesAvailable: false }, libraryAuthoring: { available: false } })
  })
  it('keeps initialized structured drafts on their existing capability path', async () => {
    schema = 1
    expect(await handler(event())).toMatchObject({ draft: { state: 'structured' }, designerAuthoring: { available: true } })
  })
  it('requires enabled gate and freshly rechecked designer authority, including persisted null scope', async () => {
    scope = null
    expect(await handler(event())).toMatchObject({ designerAuthoring: { available: true } })
    expect(mocks.access).toHaveBeenLastCalledWith('token', id, null, 'write')
    expect(await handler(event(false))).toMatchObject({ designerAuthoring: { available: false } })
    mocks.access.mockResolvedValue('staff')
    expect(await handler(event())).toMatchObject({ designerAuthoring: { available: false } })
    mocks.access.mockImplementation((_token, _actor, _scope, access) => {
      if (access === 'write') throw Object.assign(new Error('revoked'), { statusCode: 403 })
      return 'staff'
    })
    expect(await handler(event())).toMatchObject({ designerAuthoring: { available: false } })
  })
  it.each([{ blankStart: true }, { clientId }, { scope: { clientId } }, { owner: { kind: 'template', id } }])('rejects request hints without discovery: %j', async (hint) => {
    mocks.body.mockResolvedValue({ command: 'lookup', templateId: id, ...hint })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(queries).toEqual([])
  })
})
