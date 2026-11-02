import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCachedCfBindings } from '../../server/utils/cfBindings'
import type { ToolContext } from '../../server/utils/ai/toolContext'

const h = vi.hoisted(() => ({ denied: false, canonical: true, mutationCalls: 0, authorityCalls: 0 }))
const id = '10000000-0000-4000-8000-000000000001'
vi.mock('~~/server/utils/db', () => {
  const query = async (sql: string) => {
    if (sql.includes('FROM campaigns c')) return { rows: [{ id: '10000000-0000-4000-8000-000000000001', client_id: '10000000-0000-4000-8000-000000000001', status: 'draft', email_design_revision_id: h.canonical ? '10000000-0000-4000-8000-000000000001' : null }] }
    if (sql.includes('FROM campaign_lists')) return { rows: [] }
    h.mutationCalls++
    throw new Error('ledger or write sentinel')
  }
  return { transactionWithoutRetry: async (work: (db: unknown) => unknown) => work({ query }), queryRowsFresh: async () => [], queryOneFresh: async () => null }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: async (ctx: unknown) => {
  h.authorityCalls++
  if (h.denied) throw Object.assign(new Error('role denied'), { statusCode: 403 })
  return ctx
} }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: async () => ({}), requireScopedClient: async () => {} }))
const { runDepartmentEmailOperation } = await import('../../server/utils/ai/marketing/departmentEmailOperations')
const create = { clientId: id, name: 'Synthetic', templateId: id, templateRevisionId: id, operationId: id, acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }
const update = { clientId: id, campaignId: id, expectedRevision: 'a'.repeat(64), patch: { subject: 'Synthetic' }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }
const key = `mcp:${'1'.repeat(64)}`, digest = '2'.repeat(64)
const ctx = (env?: Record<string, unknown>) => ({ userId: id, userRole: 'staff', event: { context: { cloudflare: { env } } } }) as unknown as ToolContext
beforeEach(() => {
  Object.assign(h, { denied: false, canonical: true, mutationCalls: 0, authorityCalls: 0 })
  setCachedCfBindings({})
  vi.stubEnv('FIGFLOW_EDM_DRAFT_SAVES_ENABLED', '')
  vi.stubEnv('FIGFLOW_EDM_LIBRARY_ENABLED', '')
})
afterEach(() => {
  setCachedCfBindings({})
  vi.unstubAllEnvs()
})
describe('canonical MCP release admission with existing authority and request precedence', () => {
  it.each(['absent', 'request false', 'request false over cache/process true', 'boolean false over cache true'])('refuses create and persisted canonical update with %s before new ledger/content effects', async (kind) => {
    let env: Record<string, unknown> = {}
    if (kind !== 'absent') env = { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: kind.startsWith('boolean') ? false : 'false', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' }
    if (kind.includes('cache')) {
      setCachedCfBindings({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' })
      vi.stubEnv('FIGFLOW_EDM_DRAFT_SAVES_ENABLED', 'true')
      vi.stubEnv('FIGFLOW_EDM_LIBRARY_ENABLED', 'true')
    }
    expect(await runDepartmentEmailOperation('marketing_create_email_campaign_draft', create, ctx(env), key, digest)).toMatchObject({ ok: false, code: 'not_found' })
    // No UUID hints: the stored campaign owner, not caller assertions, determines admission.
    expect(await runDepartmentEmailOperation('marketing_update_email_campaign_draft', update, ctx(env), key, digest)).toMatchObject({ ok: false, code: 'not_found' })
    expect(h.mutationCalls).toBe(0)
    expect(h.authorityCalls).toBe(2)
  })
  it('requires the separate library flag only for canonical create', async () => {
    setCachedCfBindings({ FIGFLOW_EDM_LIBRARY_ENABLED: 'true' })
    const env = { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'false' }
    expect(await runDepartmentEmailOperation('marketing_create_email_campaign_draft', create, ctx(env), key, digest)).toMatchObject({ ok: false, code: 'not_found' })
    expect(h.mutationCalls).toBe(0)
    // Update passes admission and reaches the existing ledger sentinel.
    expect(await runDepartmentEmailOperation('marketing_update_email_campaign_draft', update, ctx(env), key, digest)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(h.mutationCalls).toBe(1)
  })
  it('preserves legacy MCP admission with flags off and never uses UUID hints as owner authority', async () => {
    h.canonical = false
    expect(await runDepartmentEmailOperation('marketing_update_email_campaign_draft', { ...update, operationId: id, expectedDesignRevisionId: id }, ctx({}), key, digest)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await runDepartmentEmailOperation('marketing_create_email_campaign_draft', { ...create, templateId: undefined, templateRevisionId: undefined, operationId: undefined }, ctx({}), key, digest)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(h.mutationCalls).toBe(2)
  })
  it('retains mandatory fresh department role policy before any release admission or writes', async () => {
    h.denied = true
    expect(await runDepartmentEmailOperation('marketing_create_email_campaign_draft', create, ctx({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' }), key, digest)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.authorityCalls).toBe(1)
    expect(h.mutationCalls).toBe(0)
  })
})
