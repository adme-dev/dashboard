/**
 * Browser social-inbox department scope (no database, no provider). Department staff
 * (MARKETING_MANAGEMENT without ADMIN/MANAGEMENT) are re-verified against current storage and only
 * reach conversations of active clients through each client's own active account. Legacy staff
 * keep the established all-clients inbox and native single-actor send semantics.
 * Real-SQL behaviour of the same predicates: socialInboxDepartmentScopePostgres.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Err = Error & { statusCode: number, statusMessage: string }
const g = globalThis as Record<string, unknown>
g.defineEventHandler = (fn: unknown) => fn
g.getRouterParam = (event: { id?: string }) => event.id
g.getQuery = (event: { query?: Record<string, unknown> }) => event.query ?? {}
g.readBody = async (event: { body?: unknown }) => event.body ?? {}
g.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input) as Err

const h = vi.hoisted(() => ({
  user: { id: 'u1', role: 'staff', permissionGroups: [] as string[] } as Record<string, unknown>,
  fresh: true,
  freshChecks: 0,
  scopeRow: true as boolean,
  scopeSql: [] as string[],
  sql: [] as string[],
  txRows: [] as unknown[],
  txRowCount: 1,
  provider: 0,
  downstream: 0
}))

vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => h.user) }))
vi.mock('~~/server/utils/clientScoping', () => ({
  hasFreshMarketingManagementPermission: vi.fn(async () => {
    h.freshChecks++
    return h.fresh
  })
}))
const record = <T>(log: string[], sql: string, result: T): T => {
  log.push(sql)
  return result
}
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: vi.fn(async (sql: string) => record(h.scopeSql, sql, h.scopeRow ? { id: 'x' } : null)),
  queryOne: vi.fn(async (sql: string) => record(h.sql, sql, null)),
  queryRows: vi.fn(async (sql: string) => record(h.sql, sql, [])),
  execute: vi.fn(async (sql: string) => record(h.sql, sql, 1))
}))
vi.mock('~~/server/utils/socialInbox/godModeMutations', () => {
  const db = { query: async (sql: string, _params?: unknown) => record(h.sql, sql, { rows: h.txRows, rowCount: h.txRowCount }) }
  return {
    executeSocialInboxMutation: async (_e: unknown, _k: string, mutate: (d: unknown) => Promise<unknown>) => mutate(db),
    executeSocialInboxExternalMutation: async (_e: unknown, _k: string, run: (r: unknown) => Promise<unknown>) =>
      run({ replay: false, markDispatched: async () => {} }),
    socialInboxTransactionDb: (d: typeof db) => ({
      queryOne: async (sql: string, p?: unknown[]) => (await d.query(sql, p as never)).rows[0] ?? null,
      execute: async (sql: string, p?: unknown[]) => (await d.query(sql, p as never)).rowCount
    })
  }
})
const provider = () => {
  h.provider++
  return { ok: true, platformMessageId: 'm1', clientId: 'c1' }
}
const downstream = () => {
  h.downstream++
  throw new Error('downstream must not be reached')
}
vi.mock('~~/server/utils/socialInbox/dispatch', () => ({ dispatchReply: vi.fn(async () => provider()) }))
vi.mock('~~/server/utils/socialInbox/events', () => ({ emitInboxEvent: vi.fn(), streamInboxEvents: vi.fn(() => {
  h.downstream++
  return 'stream'
}) }))
vi.mock('~~/server/utils/socialInbox/notes', () => ({ insertInternalNote: vi.fn(async () => 'n1'), notifyNoteMentions: vi.fn(async () => {}) }))
vi.mock('~~/server/utils/socialInbox/clientApprovals', () => ({
  recordSocialInboxApprovalEvent: vi.fn(async () => {}), requestSocialReplyClientApproval: vi.fn(downstream), SocialInboxClientApprovalError: class extends Error {}
}))
vi.mock('~~/server/utils/socialInbox/sourcePostMedia', () => ({ fetchMetaSourcePostImageUrl: vi.fn(downstream) }))
vi.mock('~~/server/utils/socialInbox/analytics', () => ({ getSocialInboxAnalytics: vi.fn(async () => {
  h.downstream++
  return {}
}) }))
vi.mock('~~/server/utils/socialInbox/aiActions', () => ({
  confirmSocialInboxAiAction: vi.fn(downstream), proposeSocialInboxAiAction: vi.fn(downstream), SocialInboxAiActionError: class extends Error {}
}))
vi.mock('~~/server/utils/socialInbox/aiContext', () => ({ loadSocialInboxAiContext: vi.fn(downstream) }))
vi.mock('~~/server/utils/socialInbox/aiDraft', () => ({ generateReplyDraft: vi.fn(downstream) }))
vi.mock('~~/server/utils/socialInbox/aiTriage', () => ({ generateSocialInboxAiTriage: vi.fn(downstream) }))
vi.mock('~~/server/utils/socialInbox/nativeLinks', () => ({
  recordSocialInboxNativeLinkEvent: vi.fn(downstream), updateSocialInboxNativeLinks: vi.fn(downstream), SocialInboxNativeLinkError: class extends Error {}
}))

type Handler = (event: unknown) => Promise<unknown>
const routes = {
  list: (await import('../../../server/api/agency/social/inbox/conversations/index.get') as { default: Handler }).default,
  detail: (await import('../../../server/api/agency/social/inbox/conversations/[id]/index.get') as { default: Handler }).default,
  patch: (await import('../../../server/api/agency/social/inbox/conversations/[id]/index.patch') as { default: Handler }).default,
  note: (await import('../../../server/api/agency/social/inbox/conversations/[id]/note.post') as { default: Handler }).default,
  reply: (await import('../../../server/api/agency/social/inbox/conversations/[id]/reply.post') as { default: Handler }).default,
  timeline: (await import('../../../server/api/agency/social/inbox/conversations/[id]/timeline.get') as { default: Handler }).default,
  typing: (await import('../../../server/api/agency/social/inbox/conversations/[id]/typing.post') as { default: Handler }).default,
  sourceImage: (await import('../../../server/api/agency/social/inbox/conversations/[id]/source-post-image.get') as { default: Handler }).default,
  aiContext: (await import('../../../server/api/agency/social/inbox/conversations/[id]/ai-context.get') as { default: Handler }).default,
  aiDraft: (await import('../../../server/api/agency/social/inbox/conversations/[id]/ai-draft.post') as { default: Handler }).default,
  aiTriage: (await import('../../../server/api/agency/social/inbox/conversations/[id]/ai-triage.post') as { default: Handler }).default,
  aiPropose: (await import('../../../server/api/agency/social/inbox/conversations/[id]/ai-actions/propose.post') as { default: Handler }).default,
  aiConfirm: (await import('../../../server/api/agency/social/inbox/conversations/[id]/ai-actions/confirm.post') as { default: Handler }).default,
  clientApproval: (await import('../../../server/api/agency/social/inbox/conversations/[id]/client-approval.post') as { default: Handler }).default,
  nativeLinks: (await import('../../../server/api/agency/social/inbox/conversations/[id]/native-links.patch') as { default: Handler }).default,
  queue: (await import('../../../server/api/agency/social/inbox/response-queue/index.get') as { default: Handler }).default,
  approve: (await import('../../../server/api/agency/social/inbox/response-queue/[id]/approve.post') as { default: Handler }).default,
  reject: (await import('../../../server/api/agency/social/inbox/response-queue/[id]/reject.post') as { default: Handler }).default,
  events: (await import('../../../server/api/agency/social/inbox/events.get') as { default: Handler }).default,
  analytics: (await import('../../../server/api/agency/social/inbox/analytics/overview.get') as { default: Handler }).default,
  health: (await import('../../../server/api/agency/social/inbox/accounts/health.get') as { default: Handler }).default
}
const route = (name: string) => (routes as Record<string, Handler>)[name]!

const CONV = '00000000-0000-4000-8000-000000000060'
const CLIENT = '00000000-0000-4000-8000-000000000010'
const QUEUE = '00000000-0000-4000-8000-000000000080'
const ev = (extra: Record<string, unknown> = {}) => ({ context: {}, ...extra })
const convEvent = (body: unknown = { content: 'hello', status: 'closed' }) => ev({ id: CONV, body })
const conversationRoutes = ['detail', 'patch', 'note', 'reply', 'timeline', 'typing', 'sourceImage', 'aiContext', 'aiDraft', 'aiTriage', 'aiPropose', 'aiConfirm', 'clientApproval', 'nativeLinks']
const clientEvents: Record<string, () => unknown> = {
  list: () => ev({ query: { clientId: CLIENT } }),
  queue: () => ev({ query: { clientId: CLIENT } }),
  approve: () => ev({ id: QUEUE, body: { clientId: CLIENT } }),
  reject: () => ev({ id: QUEUE, body: { clientId: CLIENT } }),
  events: () => ev({ query: { clientId: CLIENT } }),
  analytics: () => ev({ query: { clientId: CLIENT } }),
  health: () => ev({ query: { clientId: CLIENT } })
}
const department = () => {
  h.user = { id: 'u1', role: 'staff', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS'] }
}
const SCOPE = 'inbox_scope_account'
const effects = () => ({ sql: h.sql.length, provider: h.provider, downstream: h.downstream })

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(h, { fresh: true, freshChecks: 0, scopeRow: true, scopeSql: [], sql: [], txRows: [{ client_id: CLIENT }], txRowCount: 1, provider: 0, downstream: 0 })
  h.user = { id: 'u1', role: 'staff', permissionGroups: ['CLIENTS'] }
})

describe('legacy (non-department) staff keep the existing inbox', () => {
  it('lists every active account without a department predicate or fresh lookups', async () => {
    await routes.list(ev({ query: {} }))
    expect(h.sql[0]).not.toContain(SCOPE)
    expect(h.freshChecks).toBe(0)
    expect(h.scopeSql).toHaveLength(0)
  })

  it('ADMIN with the department grant is not narrowed (no generalized ADMIN/MANAGEMENT change)', async () => {
    h.user = { id: 'u1', role: 'staff', permissionGroups: ['ADMIN', 'MARKETING_MANAGEMENT'] }
    await routes.list(ev({ query: {} }))
    await routes.reply(convEvent())
    expect(h.sql[0]).not.toContain(SCOPE)
    expect(h.freshChecks).toBe(0)
    expect(h.provider).toBe(1)
  })

  it('keeps the native single-actor reply and approve semantics', async () => {
    await routes.reply(convEvent())
    expect(h.provider).toBe(1)
    const queueRow = { id: QUEUE, client_id: CLIENT, conversation_id: CONV, draft_content: 'draft', status: 'pending', approver_type: 'staff' }
    const db = await import('~~/server/utils/db')
    vi.mocked(db.queryOne).mockResolvedValueOnce(queueRow as never)
    await routes.approve(ev({ id: QUEUE, body: { clientId: CLIENT } }))
    expect(h.provider).toBe(2)
    expect(h.sql.join('\n')).not.toContain(SCOPE)
  })
})

describe('department staff', () => {
  beforeEach(department)

  it('applies the active-client/own-active-account predicate in SQL before ORDER BY and LIMIT', async () => {
    await routes.list(ev({ query: { search: 'x', limit: '5' } }))
    const sql = h.sql[0]!
    expect(sql.indexOf(SCOPE)).toBeGreaterThan(0)
    expect(sql.indexOf(SCOPE)).toBeLessThan(sql.lastIndexOf('ORDER BY c.last_message_at'))
    expect(sql).toMatch(/inbox_scope_account\.client_id = c\.client_id/)
    expect(sql).toMatch(/inbox_scope_client\.is_active = TRUE/)
    expect(sql).toMatch(/inbox_scope_account\.is_active = TRUE/)
    expect(h.freshChecks).toBe(1)
  })

  it('queue list is scoped (row client = conversation client) before the limit', async () => {
    await routes.queue(ev({ query: { clientId: CLIENT, status: 'actionable' } }))
    const sql = h.sql[0]!
    expect(sql).toContain('inbox_scope_conversation.client_id = rq.client_id')
    expect(sql.indexOf(SCOPE)).toBeLessThan(sql.lastIndexOf('LIMIT'))
  })

  it.each([...conversationRoutes, ...Object.keys(clientEvents)])('%s: a revoked grant is refused before any data access or provider call', async (name) => {
    h.fresh = false
    const event = clientEvents[name]?.() ?? convEvent()
    await expect(route(name)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(effects()).toEqual({ sql: 0, provider: 0, downstream: 0 })
    expect(h.scopeSql).toHaveLength(0)
  })

  it.each(conversationRoutes)('%s: out-of-scope conversation (inactive/foreign account or client) is 404 with no effect', async (name) => {
    h.scopeRow = false
    await expect(route(name)(convEvent())).rejects.toMatchObject({ statusCode: 404 })
    expect(effects()).toEqual({ sql: 0, provider: 0, downstream: 0 })
    expect(h.scopeSql[0]).toContain(SCOPE)
  })

  it.each(conversationRoutes)('%s: a non-UUID conversation id is 404 without a lookup', async (name) => {
    await expect(route(name)(ev({ id: 'not-a-uuid', body: { content: 'x' } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(h.scopeSql).toHaveLength(0)
    expect(effects()).toEqual({ sql: 0, provider: 0, downstream: 0 })
  })

  it.each(Object.keys(clientEvents))('%s: an inactive or unknown client is refused with no effect', async (name) => {
    h.scopeRow = false
    await expect(route(name)(clientEvents[name]!())).rejects.toMatchObject({ statusCode: 403 })
    expect(effects()).toEqual({ sql: 0, provider: 0, downstream: 0 })
    expect(h.scopeSql[0]).toMatch(/agency_clients WHERE id = \$1 AND is_active = TRUE/)
  })

  it('patch re-binds the scope into the UPDATE and 404s when the row left scope after the guard', async () => {
    h.txRows = []
    await expect(routes.patch(convEvent({ status: 'closed' }))).rejects.toMatchObject({ statusCode: 404 })
    expect(h.sql[0]).toMatch(/^UPDATE social_conversations[\s\S]*inbox_scope_account\.client_id = social_conversations\.client_id/)
  })

  it('note reads the conversation through the scope inside the transaction', async () => {
    await routes.note(convEvent({ content: 'internal' }))
    expect(h.sql[0]).toContain(SCOPE)
  })

  it('approve binds the queue scope into the read and the claim; out-of-scope rows never dispatch', async () => {
    await expect(routes.approve(ev({ id: QUEUE, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(h.sql[0]).toContain('inbox_scope_conversation.client_id = social_response_queue.client_id')
    expect(h.provider).toBe(0)

    const db = await import('~~/server/utils/db')
    vi.mocked(db.queryOne).mockResolvedValueOnce({ id: QUEUE, client_id: CLIENT, conversation_id: CONV, draft_content: 'd', status: 'pending', approver_type: 'staff' } as never)
    vi.mocked(db.execute).mockImplementationOnce(async (sql: string) => record(h.sql, sql, 0))
    await expect(routes.approve(ev({ id: QUEUE, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 409 })
    expect(h.sql.at(-1)).toMatch(/^\s*UPDATE social_response_queue[\s\S]*inbox_scope_conversation/)
    expect(h.provider).toBe(0)
  })

  it('reject binds the scope into the read and the update', async () => {
    h.txRows = [{ conversation_id: CONV, status: 'pending', approver_type: 'staff' }]
    h.txRowCount = 0
    await expect(routes.reject(ev({ id: QUEUE, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 409 })
    expect(h.sql[0]).toContain('inbox_scope_conversation')
    expect(h.sql[1]).toMatch(/UPDATE social_response_queue[\s\S]*inbox_scope_conversation/)
  })

  it('account health only counts own-client conversations of active accounts/clients and never selects tokens', async () => {
    await routes.health(ev({ query: {} }))
    const sql = h.sql[0]!
    expect(sql).toContain('c.client_id = a.client_id')
    expect(sql).toMatch(/a\.is_active = TRUE AND EXISTS \(SELECT 1 FROM agency_clients ac WHERE ac\.id = a\.client_id AND ac\.is_active = TRUE\)/)
    expect(sql).not.toMatch(/access_token/)
  })

  it('reply and approve for in-scope rows still send as the single explicit human (accepted browser semantics)', async () => {
    await routes.reply(convEvent())
    expect(h.provider).toBe(1)
    const db = await import('~~/server/utils/db')
    vi.mocked(db.queryOne).mockResolvedValueOnce({ id: QUEUE, client_id: CLIENT, conversation_id: CONV, draft_content: 'd', status: 'pending', approver_type: 'staff' } as never)
    await routes.approve(ev({ id: QUEUE, body: { clientId: CLIENT } }))
    expect(h.provider).toBe(2)
  })
})
