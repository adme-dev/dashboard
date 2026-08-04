import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent } from 'h3'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const SECRET = 'task-6-fix-2-dedicated-pages-secret-32-bytes'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  resolvePermissions: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOneFresh,
  queryRows: mocks.queryRows,
  execute: mocks.execute
}))
vi.mock('~~/server/utils/roleResolver', () => ({
  resolveUserPermissions: mocks.resolvePermissions
}))

;(globalThis as any).getCookie = () => null
;(globalThis as any).getHeader = (event: any, name: string) => event.node.req.headers[name.toLowerCase()]

const { requireAuth } = await import('~~/server/utils/auth')
const { resolveGodModeAuthority } = await import('~~/server/utils/godMode/authority')
const {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  installGodModeInternalExecutionDelegator
} = await import('~~/server/utils/godMode/internalExecutionDelegation')
const { makeCreateTaskExecutor } = await import('~~/server/utils/ai/executors/createTask')
const { makeExpenseApprovalExecutor } = await import('~~/server/utils/ai/executors/financeActions')
const { makeScheduleSocialPostExecutor } = await import('~~/server/utils/ai/executors/scheduleSocialPost')
const { makeOpportunityExecutor } = await import('~~/server/utils/ai/executors/crmActions')
const { makeProofStatusExecutor } = await import('~~/server/utils/ai/executors/creativeActions')

function h3Event(path: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  const encodedBody = Buffer.from(JSON.stringify(body))
  const request = Readable.from([encodedBody]) as unknown as IncomingMessage
  request.method = method
  request.url = path
  request.headers = {
    host: 'app.xeroflow.test',
    'content-type': 'application/json',
    'content-length': String(encodedBody.byteLength),
    ...headers
  }
  const response = { writableEnded: false, headersSent: false } as ServerResponse
  const event = createEvent(request, response)
  ;(event.context as any).cloudflare = { env: { GOD_MODE_INTERNAL_EXECUTION_SECRET: SECRET } }
  return event
}

async function originEvent(index: number, toolName: string) {
  const event = h3Event('/api/internal/mcp/call', 'POST', {}, {
    authorization: 'Bearer caller-material-must-not-cross',
    cookie: 'auth_token=caller-material-must-not-cross',
    'x-mcp-assertion': 'caller-assertion-must-not-cross',
    'x-mcp-secret': 'caller-secret-must-not-cross',
    'x-mcp-scope': 'mcp:write'
  })
  const authority = await resolveGodModeAuthority(event, OWNER_ID)
  installGodModeInternalExecutionDelegator(event, {
    actorUserId: OWNER_ID,
    authority,
    correlationId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    idempotencyKey: `mcp:${index.toString(16).repeat(64).slice(0, 64)}`,
    routeOrTool: toolName
  })
  return event
}

describe('MCP God mode internal HTTP execution', () => {
  const consumed = new Set<string>()
  const downstreamExecutions: string[] = []
  const captured: Array<{ url: string, options: any }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    consumed.clear()
    downstreamExecutions.length = 0
    captured.length = 0
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
        return {
          id: OWNER_ID,
          email: 'owner@example.test',
          name: 'Owner',
          role: 'owner',
          is_active: true,
          custom_role_id: null
        }
      }
      if (sql.includes("user_role = 'owner'")) return { id: OWNER_ID }
      return null
    })
    vi.stubGlobal('$fetch', vi.fn(async (url: string, options: any) => {
      captured.push({ url, options })
      const forwarded = Object.fromEntries(new Headers(options.headers).entries())
      const event = h3Event(url, options.method, options.body, forwarded)
      const user = await requireAuth(event)
      downstreamExecutions.push(`${options.method} ${url}:${user.id}`)

      if (url === '/api/agency/tasks') return { id: 'task-1' }
      if (url.includes('/expenses/')) return { expense: { id: 'expense-1' } }
      if (url === '/api/agency/social/publishing/posts') return { id: 'post-1' }
      if (url === '/api/crm/opportunities') return { item: { id: 'opportunity-1' } }
      if (url.includes('/proofs/')) return { proof: { id: 'proof-1' } }
      throw new Error('unexpected representative route')
    }))
  })

  it('authenticates representative task, finance, social, CRM, and creative/banner defaults as the fresh owner', async () => {
    const cases = [
      {
        tool: 'create_task',
        executor: makeCreateTaskExecutor(),
        payload: { title: 'Ship', clientId: CLIENT_ID }
      },
      {
        tool: 'propose_expense_approval',
        executor: makeExpenseApprovalExecutor(),
        payload: { expenseId: 'expense-1', label: 'Media', action: 'approve' }
      },
      {
        tool: 'propose_schedule_post',
        executor: makeScheduleSocialPostExecutor(),
        payload: { clientId: CLIENT_ID, clientName: 'Acme', content: 'Launch', platforms: ['linkedin'], status: 'draft' }
      },
      {
        tool: 'propose_opportunity',
        executor: makeOpportunityExecutor(),
        payload: { client_id: CLIENT_ID, clientName: 'Acme', name: 'Launch', stage_id: 'stage-1', stageName: 'New' }
      },
      {
        tool: 'propose_proof_status',
        executor: makeProofStatusExecutor(),
        payload: { proofId: 'proof-1', proofName: 'Banner v2', status: 'approved' }
      }
    ]

    for (const [offset, item] of cases.entries()) {
      const event = await originEvent(offset + 1, item.tool)
      await expect(item.executor.execute(item.payload, {
        userId: OWNER_ID,
        userRole: 'owner',
        source: 'mcp',
        event
      })).resolves.toMatchObject({ resultRef: expect.any(String) })
    }

    expect(downstreamExecutions).toHaveLength(5)
    expect(downstreamExecutions.every(entry => entry.endsWith(`:${OWNER_ID}`))).toBe(true)
    expect(captured.every(call => new Headers(call.options.headers).has(GOD_MODE_INTERNAL_EXECUTION_HEADER))).toBe(true)
    expect(captured.every(call => {
      const headers = new Headers(call.options.headers)
      return !headers.has('authorization')
        && !headers.has('cookie')
        && !headers.has('x-mcp-assertion')
        && !headers.has('x-mcp-secret')
        && !headers.has('x-mcp-scope')
        && !headers.has('x-user-id')
    })).toBe(true)
  })

  it('preserves ordinary application session headers when no trusted MCP delegator is installed', async () => {
    vi.stubGlobal('$fetch', vi.fn(async (url: string, options: any) => {
      captured.push({ url, options })
      return { id: 'task-ordinary' }
    }))
    const event = h3Event('/api/agency/ai/chat', 'POST', {}, {
      authorization: 'Bearer ordinary-session',
      cookie: 'auth_token=ordinary-session'
    })

    await expect(makeCreateTaskExecutor().execute({ title: 'Ordinary', clientId: CLIENT_ID }, {
      userId: OWNER_ID,
      userRole: 'owner',
      source: 'chat',
      event
    })).resolves.toMatchObject({ resultRef: 'task-ordinary' })

    const headers = new Headers(captured[0]!.options.headers)
    expect(headers.get('authorization')).toBe('Bearer ordinary-session')
    expect(headers.get('cookie')).toBe('auth_token=ordinary-session')
    expect(headers.has(GOD_MODE_INTERNAL_EXECUTION_HEADER)).toBe(false)
  })

  it('rejects replay at real requireAuth before a downstream handler can execute twice', async () => {
    const event = await originEvent(9, 'create_task')
    await makeCreateTaskExecutor().execute({ title: 'Once', clientId: CLIENT_ID }, {
      userId: OWNER_ID,
      userRole: 'owner',
      source: 'mcp',
      event
    })
    const call = captured[0]!
    const forwarded = Object.fromEntries(new Headers(call.options.headers).entries())

    await expect(requireAuth(h3Event(call.url, call.options.method, call.options.body, forwarded)))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(downstreamExecutions).toHaveLength(1)
  })

  it('rejects path and body substitution at real requireAuth before a downstream handler executes', async () => {
    const event = await originEvent(10, 'create_task')
    await makeCreateTaskExecutor().execute({ title: 'Exact', clientId: CLIENT_ID }, {
      userId: OWNER_ID,
      userRole: 'owner',
      source: 'mcp',
      event
    })
    const call = captured[0]!
    const forwarded = Object.fromEntries(new Headers(call.options.headers).entries())

    await expect(requireAuth(h3Event('/api/crm/opportunities', call.options.method, call.options.body, forwarded)))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(requireAuth(h3Event(call.url, call.options.method, { ...call.options.body, title: 'Substituted' }, forwarded)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(downstreamExecutions).toHaveLength(1)
  })

  it('marks a downstream auth 401 as proven pre-dispatch', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw Object.assign(new Error('downstream authentication rejected'), { statusCode: 401 })
    }))
    const event = await originEvent(11, 'create_task')

    await expect(makeCreateTaskExecutor().execute({ title: 'Rejected', clientId: CLIENT_ID }, {
      userId: OWNER_ID,
      userRole: 'owner',
      source: 'mcp',
      event
    })).rejects.toMatchObject({
      statusCode: 401,
      boundedCode: 'internal_delegation_rejected',
      preDispatch: true
    })
  })

  it('fails closed before dispatch when the Pages-only delegation secret is unavailable', async () => {
    vi.stubEnv('GOD_MODE_INTERNAL_EXECUTION_SECRET', '')
    const dispatch = vi.fn()
    vi.stubGlobal('$fetch', dispatch)
    const event = await originEvent(12, 'create_task')
    delete (event.context as any).cloudflare.env.GOD_MODE_INTERNAL_EXECUTION_SECRET

    await expect(makeCreateTaskExecutor().execute({ title: 'No secret', clientId: CLIENT_ID }, {
      userId: OWNER_ID,
      userRole: 'owner',
      source: 'mcp',
      event
    })).rejects.toMatchObject({
      boundedCode: 'internal_delegation_unavailable',
      preDispatch: true
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not let an ordinary caller-supplied delegation header replace cookie/session auth', async () => {
    const forged = h3Event('/api/agency/tasks', 'POST', { title: 'Forged' }, {
      [GOD_MODE_INTERNAL_EXECUTION_HEADER]: 'actor-from-client'
    })

    await expect(requireAuth(forged)).rejects.toMatchObject({ statusCode: 401 })
    expect(downstreamExecutions).toHaveLength(0)
  })
})
