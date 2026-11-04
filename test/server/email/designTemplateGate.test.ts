import { beforeEach, expect, it, vi } from 'vitest'
import handler from '../../../server/api/email/design/designer.post'
import { designerGate } from '../../../server/utils/email-marketing/designerGate'

const mocks = vi.hoisted(() => ({ body: vi.fn(), query: vi.fn(), access: vi.fn(), replay: false, writes: [] as string[] }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (f: unknown) => f, getCookie: () => 'token', getHeader: (_e: unknown, key: string) => ({ origin: 'https://app.xeroflow.io', 'content-type': 'application/json' })[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: async () => ({ id: '10000000-0000-4000-8000-000000000001' }) }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../../server/utils/email-marketing/designRequest')>()), readBoundedJson: mocks.body }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async (callback: (db: unknown) => unknown) => callback({ query: mocks.query }) }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
const id = '10000000-0000-4000-8000-000000000001'
const event = () => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: 'true' } } } }) as unknown as Parameters<typeof handler>[0]
const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
const action = { version: 1, operationId: id, scope: { clientId: id } }
const recovery = { command: 'save-proposal-as-new-draft', handoffId: id, action: { ...action, action: 'save-proposal-as-new-draft', proposalId: id, expectedProposalRevisionId: id, name: 'Recovery' } }
const requests = [
  { command: 'start', operationId: id, owner: { kind: 'campaign', id }, clientId: id },
  { command: 'open', operationId: id, draftId: id, expectedRevisionId: id },
  { command: 'resume', handoffId: id },
  { command: 'propose', handoffId: id, action: { ...action, action: 'propose-designer-return', draftId: id, baseRevisionId: id, operations: [] } },
  { command: 'apply', handoffId: id, action: { ...action, action: 'apply-return', proposalId: id, expectedProposalRevisionId: id, expectedDraftRevisionId: id } },
  { command: 'cancel', handoffId: id, action: { ...action, action: 'cancel-return', proposalId: id, expectedProposalRevisionId: id } },
  recovery
]
beforeEach(() => {
  vi.resetAllMocks()
  mocks.replay = false
  mocks.writes = []
  mocks.access.mockResolvedValue('designer')
  mocks.query.mockImplementation(async (sql: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) { mocks.writes.push(sql); throw new Error('Unexpected write') }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.startsWith('SELECT request_text FROM email_design_handoff_receipts')) return { rows: mocks.replay ? [{ request_text: stable({ ...recovery, authoringMode: 'designer' }) }] : [] }
    if (sql.startsWith('SELECT id FROM email_design_handoffs')) return { rows: [] }
    if (sql.startsWith('SELECT * FROM email_design_documents') || sql.includes('SELECT h.*')) return { rows: [{ campaign_id: id }] }
    if (sql.includes('operation_id FROM')) return { rows: [] }
    throw new Error(`Unexpected read: ${sql}`)
  })
})
it.each(requests)('refuses campaign $command before writes via the real route and executor', async request => {
  mocks.body.mockResolvedValue(request)
  await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })
  expect(mocks.writes).toEqual([])
  expect(mocks.access).not.toHaveBeenCalled()
})
it('refuses committed campaign recovery replay before writes', async () => {
  mocks.replay = true
  mocks.body.mockResolvedValue(recovery)
  await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })
  expect(mocks.writes).toEqual([])
})
it.each([{}, { FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: true }, { FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: 'TRUE' }])('fails closed for absent or nonliteral flags %j', env => {
  expect(designerGate(env)).toEqual({ template: false, campaign: false })
})
it('preserves global designer semantics', () => {
  expect(designerGate({ FIGFLOW_EDM_DESIGNER_ENABLED: 'true' })).toEqual({ template: true, campaign: true })
  expect(designerGate({ FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: 'true' })).toEqual({ template: true, campaign: false })
})
