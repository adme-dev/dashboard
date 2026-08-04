import { describe, expect, it, vi } from 'vitest'

import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import {
  GOD_MODE_INTERNAL_EXECUTION_AUDIENCE,
  consumeGodModeInternalExecutionDelegation,
  getTrustedTask5DelegatedExecution,
  isAllowedGodModeInternalExecutionTarget,
  signGodModeInternalExecutionClaim,
  verifyGodModeInternalExecutionClaim
} from '~~/server/utils/godMode/internalExecutionDelegation'

const SECRET = 'task-6-fix-2-dedicated-pages-secret-32-bytes'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222'
const IDEMPOTENCY_KEY = `mcp:${'a'.repeat(64)}`
const JTI = '33333333-3333-4333-8333-333333333333'
const NOW_MS = 2_000_000_000_000
const PATH = '/api/agency/tasks'
const BODY = { title: 'Ship', clientId: '44444444-4444-4444-8444-444444444444' }

async function activeOwner(event: any, actorUserId = ACTOR_ID) {
  return await resolveGodModeAuthority(event, actorUserId, {
    queryOneFresh: async () => ({ id: actorUserId })
  })
}

async function signed(overrides: Record<string, unknown> = {}) {
  return await signGodModeInternalExecutionClaim({
    actorUserId: ACTOR_ID,
    channel: 'mcp',
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    routeOrTool: 'create_task',
    method: 'POST',
    path: PATH,
    bodyDigest: await digestMcpRequestBody(BODY),
    ...overrides
  } as any, SECRET, { now: NOW_MS, jti: JTI })
}

describe('God mode internal execution delegation', () => {
  it('signs a dedicated short-lived exact-request claim without session material', async () => {
    const encoded = await signed()

    await expect(verifyGodModeInternalExecutionClaim(encoded, SECRET, { now: NOW_MS }))
      .resolves.toEqual(expect.objectContaining({
        actorUserId: ACTOR_ID,
        audience: GOD_MODE_INTERNAL_EXECUTION_AUDIENCE,
        channel: 'mcp',
        correlationId: CORRELATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        routeOrTool: 'create_task',
        method: 'POST',
        path: PATH,
        bodyDigest: await digestMcpRequestBody(BODY),
        jti: JTI
      }))
    expect(encoded).not.toContain(ACTOR_ID)
    expect(encoded).not.toContain(SECRET)
  })

  it('accepts one exact request only after fresh branded owner resolution and atomic nonce claim', async () => {
    const encoded = await signed()
    const consumed = new Set<string>()
    const consumeNonce = vi.fn(async (jti: string) => {
      if (consumed.has(jti)) return false
      consumed.add(jti)
      return true
    })
    const event = { context: {} } as any
    const resolveAuthority = vi.fn(async (_event: any, actor: string) => await activeOwner(event, actor))
    const dependencies = {
      signingSecret: SECRET,
      now: NOW_MS,
      encoded,
      method: 'POST',
      path: PATH,
      body: BODY,
      resolveAuthority,
      consumeNonce
    }

    await expect(consumeGodModeInternalExecutionDelegation(event, dependencies))
      .resolves.toEqual(expect.objectContaining({ actorUserId: ACTOR_ID, jti: JTI }))
    expect(resolveAuthority).toHaveBeenCalledWith(event, ACTOR_ID)
    expect(consumeNonce).toHaveBeenCalledWith(JTI, ACTOR_ID, expect.any(Number))

    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, dependencies))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('installs a runtime-branded exact Task 5 marker that rejects actor, method, path, body, and expiry drift', async () => {
    const event = { method: 'POST', context: {}, path: PATH } as any
    await consumeGodModeInternalExecutionDelegation(event, {
      signingSecret: SECRET,
      now: NOW_MS,
      encoded: await signed(),
      method: 'POST',
      path: PATH,
      body: BODY,
      resolveAuthority: async request => await activeOwner(request),
      consumeNonce: async () => true
    })
    event.context.user = { id: ACTOR_ID }

    await expect(getTrustedTask5DelegatedExecution(event, {
      now: NOW_MS,
      method: 'POST',
      path: PATH,
      body: BODY
    })).resolves.toMatchObject({
      actorUserId: ACTOR_ID,
      channel: 'mcp',
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      routeOrTool: 'create_task',
      method: 'POST',
      path: PATH
    })

    const clone = { ...event, context: { ...event.context } }
    await expect(getTrustedTask5DelegatedExecution(clone, {
      now: NOW_MS,
      method: 'POST',
      path: PATH,
      body: BODY
    })).resolves.toBeNull()

    for (const changed of [
      { method: 'PATCH', path: PATH, body: BODY, now: NOW_MS },
      { method: 'POST', path: '/api/crm/opportunities', body: BODY, now: NOW_MS },
      { method: 'POST', path: PATH, body: { ...BODY, title: 'changed' }, now: NOW_MS },
      { method: 'POST', path: PATH, body: BODY, now: NOW_MS + 61_000 }
    ]) {
      await expect(getTrustedTask5DelegatedExecution(event, changed)).rejects.toMatchObject({ statusCode: 403 })
    }

    event.context.user = { id: '99999999-9999-4999-8999-999999999999' }
    await expect(getTrustedTask5DelegatedExecution(event, {
      now: NOW_MS,
      method: 'POST',
      path: PATH,
      body: BODY
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each([
    ['method', { method: 'PATCH' }],
    ['path', { path: '/api/crm/opportunities' }],
    ['body', { body: { ...BODY, title: 'Substituted' } }]
  ])('rejects %s substitution before consuming the nonce', async (_label, changed) => {
    const consumeNonce = vi.fn(async () => true)

    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, {
      signingSecret: SECRET,
      now: NOW_MS,
      encoded: await signed(),
      method: 'POST',
      path: PATH,
      body: BODY,
      resolveAuthority: async event => await activeOwner(event),
      consumeNonce,
      ...changed
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(consumeNonce).not.toHaveBeenCalled()
  })

  it('rejects an unreadable or missing request body as a bounded mismatch before nonce consumption', async () => {
    const consumeNonce = vi.fn(async () => true)

    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, {
      signingSecret: SECRET,
      now: NOW_MS,
      encoded: await signed(),
      method: 'POST',
      path: PATH,
      body: undefined,
      resolveAuthority: async event => await activeOwner(event),
      consumeNonce
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(consumeNonce).not.toHaveBeenCalled()
  })

  it('rejects expiry and a current owner downgrade before nonce consumption', async () => {
    const consumeNonce = vi.fn(async () => true)
    const encoded = await signed()

    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, {
      signingSecret: SECRET,
      now: NOW_MS + 61_000,
      encoded,
      method: 'POST',
      path: PATH,
      body: BODY,
      resolveAuthority: async event => await activeOwner(event),
      consumeNonce
    })).rejects.toMatchObject({ statusCode: 401 })

    const downgradedEvent = { context: {} } as any
    await expect(consumeGodModeInternalExecutionDelegation(downgradedEvent, {
      signingSecret: SECRET,
      now: NOW_MS,
      encoded,
      method: 'POST',
      path: PATH,
      body: BODY,
      resolveAuthority: async (_event, actor) => await resolveGodModeAuthority(downgradedEvent, actor, {
        queryOneFresh: async () => null
      }),
      consumeNonce
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(consumeNonce).not.toHaveBeenCalled()
  })

  it.each([
    ['create_task', 'POST', '/api/agency/tasks'],
    ['propose_schedule_post', 'POST', '/api/agency/social/publishing/posts'],
    ['propose_budget_alert', 'POST', '/api/agency/budget-alerts'],
    ['propose_budget_change', 'POST', '/api/agency/social/spend/spend-1/actions/plan'],
    ['assign_task', 'PATCH', '/api/agency/tasks/task-1/assignee'],
    ['propose_status_change', 'PATCH', '/api/agency/tasks/task-1/status'],
    ['propose_brief_convert', 'POST', '/api/agency/briefs/brief-1/convert'],
    ['propose_opportunity', 'POST', '/api/crm/opportunities'],
    ['log_crm_activity', 'POST', '/api/crm/activities'],
    ['propose_quote', 'POST', '/api/crm/opportunities/opportunity-1/create-quote'],
    ['propose_expense_approval', 'POST', '/api/agency/expenses/expense-1/approve'],
    ['propose_eom_generate', 'POST', '/api/agency/eom/generate'],
    ['propose_expense_classify', 'PUT', '/api/agency/expenses/expense-1'],
    ['propose_proof_status', 'PUT', '/api/agency/proofs/proof-1/status']
  ])('allows the registered internal HTTP target for %s', (_tool, method, path) => {
    expect(isAllowedGodModeInternalExecutionTarget(method, path)).toBe(true)
  })
})
