import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ dbCalls: 0, deny: false, scoped: true }))
vi.mock('~~/server/utils/db', () => {
  const touch = async () => {
    h.dbCalls++
    throw new Error('database must not be reached')
  }
  return { queryRowsFresh: touch, queryOneFresh: touch, transaction: touch }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: Record<string, unknown>, write: boolean) => {
    if (h.deny) throw Object.assign(new Error('revoked'), { statusCode: 403 })
    return { ...ctx, write }
  })
}))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: vi.fn(async () => ({})),
  requireScopedClient: vi.fn(async () => { if (!h.scoped) throw Object.assign(new Error('nf'), { statusCode: 404 }) })
}))

const { runDepartmentWorkOperation } = await import('~~/server/utils/ai/marketing/departmentWorkOperations')
const { runDepartmentContentOperation } = await import('~~/server/utils/ai/marketing/departmentContentOperations')
const authority = await import('~~/server/utils/ai/marketing/departmentAuthority')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const UUID = '22222222-2222-4222-8222-222222222222'
const KEY = `mcp:${'1'.repeat(64)}`
const DIGEST = 'f'.repeat(64)
const ctx = { userId: UUID, userRole: 'staff', event: {} } as never
const createTask = { clientId: CLIENT, projectId: UUID, boardId: UUID, title: 'T', acknowledgement: 'CREATE_CLIENT_TASK' }
const publish = { clientId: CLIENT, assetId: UUID, versionId: UUID, expectedContentHash: 'a'.repeat(64), acknowledgement: 'PUBLISH_APPROVED_CONTENT' }

describe('department work/content operation boundaries (no database)', () => {
  beforeEach(() => {
    Object.assign(h, { dbCalls: 0, deny: false, scoped: true })
    vi.clearAllMocks()
  })

  it('fails closed on revoked authority before any database access', async () => {
    h.deny = true
    expect(await runDepartmentWorkOperation('marketing_create_work_task', createTask, ctx, KEY, DIGEST)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runDepartmentContentOperation('marketing_publish_content_version', publish, ctx, KEY, DIGEST, { isEntitled: async () => true })).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runDepartmentWorkOperation('marketing_list_work_tasks', { clientId: CLIENT }, ctx)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.dbCalls).toBe(0)
  })

  it('requests write consent for mutations and read-only authority for reads', async () => {
    h.scoped = false
    await runDepartmentWorkOperation('marketing_create_work_task', createTask, ctx, KEY, DIGEST)
    await runDepartmentWorkOperation('marketing_list_work_briefs', { clientId: CLIENT }, ctx)
    expect(vi.mocked(authority.requireMarketingDepartment).mock.calls.map(call => call[1])).toEqual([true, false])
  })

  it('refuses out-of-scope clients, missing entitlement and unverified execution identity before database access', async () => {
    h.scoped = false
    expect(await runDepartmentWorkOperation('marketing_list_work_tasks', { clientId: CLIENT }, ctx)).toMatchObject({ ok: false, code: 'not_found' })
    h.scoped = true
    expect(await runDepartmentContentOperation('marketing_list_content_assets', { clientId: CLIENT }, ctx, undefined, undefined, { isEntitled: async () => false }))
      .toMatchObject({ ok: false, code: 'not_entitled' })
    expect(await runDepartmentWorkOperation('marketing_create_work_task', createTask, ctx, 'mcp:short', DIGEST)).toMatchObject({ ok: false, code: 'coordinator_required' })
    expect(await runDepartmentContentOperation('marketing_publish_content_version', publish, ctx, KEY, 'nope')).toMatchObject({ ok: false, code: 'coordinator_required' })
    expect(h.dbCalls).toBe(0)
  })

  it('rejects billing fields, unknown keys, missing acknowledgements and approval-bearing brief transitions', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['marketing_create_work_task', { ...createTask, estimatedCost: 10 }],
      ['marketing_create_work_task', { ...createTask, acknowledgement: undefined }],
      ['marketing_update_work_task', { clientId: CLIENT, taskId: UUID, expectedVersion: 1, patch: { billingRate: 1 }, acknowledgement: 'UPDATE_CLIENT_TASK' }],
      ['marketing_update_work_task', { clientId: CLIENT, taskId: UUID, expectedVersion: 1, patch: {}, acknowledgement: 'UPDATE_CLIENT_TASK' }],
      ['marketing_set_work_brief_status', { clientId: CLIENT, briefId: UUID, expectedStatus: 'under_review', status: 'completed', note: 'n', acknowledgement: 'CHANGE_CLIENT_BRIEF_STATUS' }],
      ['marketing_set_work_brief_status', { clientId: CLIENT, briefId: UUID, expectedStatus: 'submitted', status: 'cancelled', note: 'n', acknowledgement: 'CHANGE_CLIENT_BRIEF_STATUS' }]
    ]
    for (const [name, args] of cases) {
      expect(await runDepartmentWorkOperation(name, args, ctx, KEY, DIGEST), name).toMatchObject({ ok: false, code: 'bad_args' })
    }
    expect(await runDepartmentContentOperation('marketing_create_content_asset', {
      clientId: CLIENT, siteId: UUID, slug: 'a', title: 'A', topic: 'T', acknowledgement: 'RECORD_PROVIDED_SOURCE_INTERVIEW',
      interview: { intervieweeName: 'N', intervieweeRole: 'R', occurredAt: '2026-10-01T00:00:00.000Z', sourceSummary: 'summary text', consentConfirmed: false }
    }, ctx, KEY, DIGEST)).toMatchObject({ ok: false, code: 'bad_args' })
    expect(await runDepartmentContentOperation('marketing_create_content_version', {
      clientId: CLIENT, assetId: UUID, expectedCurrentVersionId: null, acknowledgement: 'CREATE_CONTENT_DRAFT_VERSION',
      bodyMarkdown: 'x'.repeat(30), excerpt: 'excerpt text', disclaimer: 'disc', schemaType: 'Article', sourceInterviewIds: [UUID], claims: []
    }, ctx, KEY, DIGEST)).toMatchObject({ ok: false, code: 'bad_args' })
    expect(h.dbCalls).toBe(0)
  })
})
