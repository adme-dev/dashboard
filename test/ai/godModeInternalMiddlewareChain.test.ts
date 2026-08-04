import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createEvent,
  getCookie,
  getHeader,
  getRequestURL,
  getRouterParam,
  readBody
} from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const DEPARTMENT_ID = '33333333-3333-4333-8333-333333333333'
const STAGE_ID = '44444444-4444-4444-8444-444444444444'
const SECRET = 'task-6-fix-3-pages-delegation-secret-32-bytes'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  resolvePermissions: vi.fn(),
  appendAudit: vi.fn(),
  mutationCount: 0,
  ownerActive: true
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOneFresh,
  queryRows: mocks.queryRows,
  execute: mocks.execute,
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/kv', () => ({ kvGet: vi.fn(async () => null), kvPut: vi.fn() }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: mocks.resolvePermissions }))
vi.mock('~~/server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: mocks.appendAudit }))
vi.mock('~~/server/utils/notifications', () => ({ notifyTaskAssigned: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/subscriptions', () => ({ autoSubscribeIfEnabled: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({
  assertPublishingTargets: vi.fn(async () => []),
  normalizePlatformOverrides: vi.fn(value => value),
  normalizePublishingTargets: vi.fn(async () => null),
  normalizeProductionReadyPublishPlatforms: vi.fn(value => value),
  normalizeSocialPostPayloadFields: vi.fn()
}))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/crm/lifecycle', () => ({ applyLifecycleEvent: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/crm/assignment', () => ({ autoAssignOnCreate: vi.fn(async () => null) }))

Object.assign(globalThis, {
  defineEventHandler: <T>(handler: T) => handler,
  getCookie,
  getHeader,
  getRequestURL,
  getRouterParam,
  readBody
})

const { default: authMiddleware } = await import('~~/server/middleware/auth')
const { createJwt, requireRole } = await import('~~/server/utils/auth')
const { handleGodModeRequest } = await import('~~/server/middleware/godMode')
const { default: rbacMiddleware } = await import('~~/server/middleware/rbac')
const { resolveGodModeAuthority } = await import('~~/server/utils/godMode/authority')
const {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  installGodModeInternalExecutionDelegator,
  mintInstalledGodModeInternalExecutionDelegation
} = await import('~~/server/utils/godMode/internalExecutionDelegation')
const { makeCreateTaskExecutor } = await import('~~/server/utils/ai/executors/createTask')
const { makeExpenseApprovalExecutor } = await import('~~/server/utils/ai/executors/financeActions')
const { makeScheduleSocialPostExecutor } = await import('~~/server/utils/ai/executors/scheduleSocialPost')
const { makeOpportunityExecutor } = await import('~~/server/utils/ai/executors/crmActions')
const { makeProofStatusExecutor } = await import('~~/server/utils/ai/executors/creativeActions')
const { default: taskHandler } = await import('~~/server/api/agency/tasks/index.post')
const { default: expenseHandler } = await import('~~/server/api/agency/expenses/[id]/approve.post')
const { default: socialHandler } = await import('~~/server/api/agency/social/publishing/posts/index.post')
const { default: opportunityHandler } = await import('~~/server/api/crm/opportunities/index.post')
const { default: proofHandler } = await import('~~/server/api/agency/proofs/[id]/status.put')

function event(path: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  const bytes = Buffer.from(JSON.stringify(body))
  const request = Readable.from([bytes]) as unknown as IncomingMessage
  request.method = method
  request.url = path
  request.headers = {
    host: 'app.xeroflow.test',
    'content-type': 'application/json',
    'content-length': String(bytes.byteLength),
    ...headers
  }
  const response = { writableEnded: false, headersSent: false } as ServerResponse
  const result = createEvent(request, response)
  ;(result.context as any).cloudflare = { env: { GOD_MODE_INTERNAL_EXECUTION_SECRET: SECRET } }
  const expense = path.match(/^\/api\/agency\/expenses\/([^/]+)\/approve$/)
  const proof = path.match(/^\/api\/agency\/proofs\/([^/]+)\/status$/)
  if (expense) result.context.params = { id: expense[1] }
  if (proof) result.context.params = { id: proof[1] }
  return result
}

async function originEvent(index: number, tool: string) {
  const request = event('/api/internal/mcp/call', 'POST', {})
  const authority = await resolveGodModeAuthority(request, OWNER_ID)
  installGodModeInternalExecutionDelegator(request, {
    actorUserId: OWNER_ID,
    authority,
    correlationId: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    idempotencyKey: `mcp:${index.toString(16).repeat(64).slice(0, 64)}`,
    routeOrTool: tool
  })
  return request
}

const handlers: Array<[RegExp, (request: any) => Promise<any>]> = [
  [/^\/api\/agency\/tasks$/, taskHandler],
  [/^\/api\/agency\/expenses\/[^/]+\/approve$/, expenseHandler],
  [/^\/api\/agency\/social\/publishing\/posts$/, socialHandler],
  [/^\/api\/crm\/opportunities$/, opportunityHandler],
  [/^\/api\/agency\/proofs\/[^/]+\/status$/, proofHandler]
]

async function runRealChain(path: string, options: any) {
  const forwarded = Object.fromEntries(new Headers(options.headers).entries())
  const request = event(path, options.method, options.body, forwarded)
  await authMiddleware(request)
  await handleGodModeRequest(request)
  await rbacMiddleware(request)
  const handler = handlers.find(([pattern]) => pattern.test(path))?.[1]
  if (!handler) throw Object.assign(new Error('unrelated route'), { statusCode: 404 })
  return await handler(request)
}

describe('Task 5 delegated execution through the real middleware and route chain', () => {
  const consumed = new Set<string>()

  beforeEach(() => {
    vi.clearAllMocks()
    consumed.clear()
    mocks.mutationCount = 0
    mocks.ownerActive = true
    mocks.resolvePermissions.mockResolvedValue({ groups: [], isReadOnly: false })
    mocks.queryRows.mockResolvedValue([])
    mocks.queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('god_mode_mcp_request_nonces')) {
        const jti = String(params[0])
        if (consumed.has(jti)) return null
        consumed.add(jti)
        return { jti }
      }
      if (sql.includes('SELECT id, email, name, user_role')) {
        return mocks.ownerActive
          ? { id: OWNER_ID, email: 'owner@test', name: 'Owner', role: 'owner', is_active: true, custom_role_id: null }
          : null
      }
      if (sql.includes("user_role = 'owner'")) {
        return mocks.ownerActive && params[0] === OWNER_ID ? { id: OWNER_ID } : null
      }
      return null
    })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM team_members') && sql.includes('sessions_invalidated_at')) {
        return { id: ADMIN_ID, email: 'admin@test', name: 'Admin', role: 'admin', is_active: true, custom_role_id: null }
      }
      if (sql.includes('FROM task_statuses')) return { id: 'status-1' }
      if (sql.includes('FROM tasks t')) return {
        id: 'task-1', department_id: DEPARTMENT_ID, status_id: 'status-1', title: 'Ship', priority: 'medium',
        task_type: 'task', reporter_id: OWNER_ID, status_name: 'To do', status_color: '#000000',
        department_name: 'Delivery', budget_source: 'manual'
      }
      if (sql.includes('FROM expenses')) return { id: 'expense-1', user_id: 'someone-else', status: 'submitted', total_amount: 10 }
      if (sql.includes('UPDATE expenses')) { mocks.mutationCount++; return { id: 'expense-1', status: 'approved', approved_by: OWNER_ID } }
      if (sql.includes('INSERT INTO social_posts')) { mocks.mutationCount++; return { id: 'post-1' } }
      if (sql.includes('FROM crm_stages')) return { id: STAGE_ID, probability: 20, is_won: false, is_lost: false }
      if (sql.includes('INSERT INTO crm_opportunities')) { mocks.mutationCount++; return { id: 'opportunity-1', owner_id: null } }
      if (sql.includes('FROM creative_proofs')) return { id: 'proof-1', name: 'Banner', status: 'draft' }
      if (sql.includes('UPDATE creative_proofs')) { mocks.mutationCount++; return { id: 'proof-1', name: 'Banner', status: 'approved' } }
      if (sql.includes('INSERT INTO proof_activities')) return { id: 'activity-1' }
      return null
    })
    mocks.transaction.mockImplementation(async (callback: (db: any) => Promise<any>) => await callback({
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO tasks')) {
          mocks.mutationCount++
          return { rows: [{ id: 'task-1', title: 'Ship' }] }
        }
        return { rows: [], rowCount: 1 }
      })
    }))
    vi.stubGlobal('$fetch', vi.fn(runRealChain))
  })

  it('reaches representative task, finance, social, CRM, and creative/banner handlers exactly once', async () => {
    const cases = [
      ['create_task', makeCreateTaskExecutor(), { title: 'Ship', departmentId: DEPARTMENT_ID }],
      ['propose_expense_approval', makeExpenseApprovalExecutor(), { expenseId: 'expense-1', label: 'Media', action: 'approve' }],
      ['propose_schedule_post', makeScheduleSocialPostExecutor(), { clientId: CLIENT_ID, clientName: 'Acme', content: 'Launch', platforms: [] }],
      ['propose_opportunity', makeOpportunityExecutor(), { client_id: CLIENT_ID, clientName: 'Acme', name: 'Launch', stage_id: STAGE_ID, stageName: 'New' }],
      ['propose_proof_status', makeProofStatusExecutor(), { proofId: 'proof-1', proofName: 'Banner', status: 'approved' }]
    ] as const

    for (const [index, [tool, executor, payload]] of cases.entries()) {
      const request = await originEvent(index + 1, tool)
      await executor.execute(payload, { userId: OWNER_ID, userRole: 'owner', source: 'mcp', event: request } as any)
    }

    expect(mocks.mutationCount).toBe(5)
  })

  it('denies an unrelated path, raw header, downgrade, and replay before another handler execution', async () => {
    const request = await originEvent(20, 'create_task')
    const body = { departmentId: DEPARTMENT_ID, title: 'Exact', reporterId: OWNER_ID }
    const claim = await mintInstalledGodModeInternalExecutionDelegation(request, {
      method: 'POST', path: '/api/agency/tasks', body
    })
    const headers = { [GOD_MODE_INTERNAL_EXECUTION_HEADER]: claim! }

    await expect(runRealChain('/api/crm/opportunities', { method: 'POST', body, headers }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(runRealChain('/api/agency/tasks', {
      method: 'POST', body, headers: { [GOD_MODE_INTERNAL_EXECUTION_HEADER]: 'raw-client-header' }
    })).rejects.toMatchObject({ statusCode: 401 })

    mocks.ownerActive = false
    await expect(runRealChain('/api/agency/tasks', { method: 'POST', body, headers }))
      .rejects.toMatchObject({ statusCode: 403 })
    mocks.ownerActive = true
    await runRealChain('/api/agency/tasks', { method: 'POST', body, headers })
    await expect(runRealChain('/api/agency/tasks', { method: 'POST', body, headers }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.mutationCount).toBe(1)
  })

  it('uses the trusted marker for owner-excluding centralized gates without a second route audit', async () => {
    const origin = await originEvent(30, 'create_task')
    const body = { departmentId: DEPARTMENT_ID, title: 'Gated', reporterId: OWNER_ID }
    const claim = await mintInstalledGodModeInternalExecutionDelegation(origin, {
      method: 'POST', path: '/api/agency/tasks', body
    })
    const request = event('/api/agency/tasks', 'POST', body, {
      [GOD_MODE_INTERNAL_EXECUTION_HEADER]: claim!
    })

    await authMiddleware(request)
    await handleGodModeRequest(request)
    await rbacMiddleware(request)
    await expect(requireRole(request, ['admin'])).resolves.toMatchObject({ id: OWNER_ID, role: 'owner' })
    expect(mocks.appendAudit).not.toHaveBeenCalled()
  })

  it('preserves the ordinary cookie middleware and real task handler flow', async () => {
    const token = await createJwt({ userId: ADMIN_ID })
    const request = event('/api/agency/tasks', 'POST', {
      departmentId: DEPARTMENT_ID,
      title: 'Ordinary',
      reporterId: ADMIN_ID
    }, { cookie: `auth_token=${token}` })

    await authMiddleware(request)
    await handleGodModeRequest(request)
    await rbacMiddleware(request)
    await taskHandler(request)

    expect(request.context.user).toMatchObject({ id: ADMIN_ID, role: 'admin' })
    expect(mocks.mutationCount).toBe(1)
  })
})
