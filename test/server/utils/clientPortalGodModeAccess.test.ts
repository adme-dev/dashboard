import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import { seedGodModeRouteAuditState } from '../../../server/utils/godMode/featureGate'
import {
  prepareGodModeClientPortalAccess,
  type GodModeClientPortalAccessDependencies
} from '../../../server/utils/clientPortal/godModeAccess'
import { executeClientPortalAccess } from '../../../server/utils/clientPortal/access'
import { digestPortalSessionToken } from '../../../server/utils/portalSession'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_CLIENT_ID = '44444444-4444-4444-8444-444444444444'
const SESSION_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '66666666-6666-4666-8666-666666666666'
const IDEMPOTENCY_KEY = 'portal-access:77777777-7777-4777-8777-777777777777'
const ROUTE = 'POST /api/agency/client-portal/access'

interface LedgerRow {
  actorUserId: string
  idempotencyKey: string
  state: string
  resultReference: string | null
  route: string
  requestDigest: string
  clientId: string
}

function event(
  clientId = CLIENT_ID,
  actorUserId = ACTOR_ID,
  idempotencyKey = IDEMPOTENCY_KEY,
  correlationId = '88888888-8888-4888-8888-888888888888'
) {
  const request = {
    method: 'POST',
    body: { clientId },
    context: { user: { id: actorUserId } },
    node: {
      req: {
        originalUrl: '/api/agency/client-portal/access',
        headers: {
          'host': 'app.xeroflow.test',
          'authorization': 'Bearer agency-session-secret',
          'idempotency-key': idempotencyKey
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event & { body: { clientId: string } }
  seedGodModeRouteAuditState(request, {
    actorUserId,
    correlationId,
    sessionDigest: 'a'.repeat(64),
    routeOrTool: ROUTE,
    emergencyDisabled: false
  })
  return request
}

function terminal(actorUserId = ACTOR_ID, correlationId = '88888888-8888-4888-8888-888888888888') {
  return {
    actorUserId,
    correlationId,
    sessionDigest: 'a'.repeat(64),
    channel: 'application' as const,
    routeOrTool: ROUTE,
    phase: 'succeeded' as const,
    bypassedControls: [],
    outcomeCode: 'http_2xx',
    emergencyDisabled: false
  }
}

describe('God mode client portal access coordination', () => {
  let ledger: LedgerRow[]
  let sessionInsertCount: number
  let activityInsertCount: number
  let loginIncrementCount: number
  const appendAudit = vi.fn()
  const query = vi.fn()
  const transaction = vi.fn()

  const actor = {
    id: ACTOR_ID,
    email: 'paul@example.com',
    name: 'Paul',
    role: 'owner'
  }

  const dependencies = (): GodModeClientPortalAccessDependencies => ({
    transaction,
    appendAudit,
    digestRequest: async (request) => {
      const clientId = (request as H3Event & { body: { clientId: string } }).body.clientId
      return clientId === CLIENT_ID ? 'b'.repeat(64) : 'c'.repeat(64)
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ledger = []
    sessionInsertCount = 0
    activityInsertCount = 0
    loginIncrementCount = 0

    query.mockImplementation(async (sqlValue: string, params: unknown[] = []) => {
      const sql = String(sqlValue)
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) {
        const [actorUserId, idempotencyKey, , route, , requestDigest] = params as string[]
        const clientId = requestDigest === 'b'.repeat(64) ? CLIENT_ID : OTHER_CLIENT_ID
        const existing = ledger.find(row => row.actorUserId === actorUserId && row.idempotencyKey === idempotencyKey)
        if (existing) return { rows: [] }
        ledger.push({
          actorUserId,
          idempotencyKey,
          state: 'in_progress',
          resultReference: null,
          route,
          requestDigest,
          clientId
        })
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        const [actorUserId, idempotencyKey] = params as string[]
        const row = ledger.find(item => item.actorUserId === actorUserId && item.idempotencyKey === idempotencyKey)
        return {
          rows: row
            ? [{
                state: row.state,
                result_reference: row.resultReference,
                route_or_tool: row.route,
                request_digest: row.requestDigest,
                client_id: row.clientId
              }]
            : []
        }
      }
      if (sql.includes('UPDATE god_mode_execution_ledger')) {
        const [actorUserId, idempotencyKey, state, resultReference] = params as string[]
        const row = ledger.find(item => item.actorUserId === actorUserId && item.idempotencyKey === idempotencyKey)
        if (row) {
          row.state = state
          row.resultReference = resultReference || null
        }
        return { rows: [] }
      }
      if (sql.includes('FROM agency_clients c')) {
        return { rows: [{ id: CLIENT_ID, name: 'Client One', logoUrl: null }] }
      }
      if (sql.includes('INSERT INTO client_users')) {
        loginIncrementCount++
        return { rows: [{ id: USER_ID }] }
      }
      if (sql.includes('INSERT INTO client_sessions')) {
        sessionInsertCount++
        return { rows: [{ id: SESSION_ID }] }
      }
      if (sql.includes('INSERT INTO client_activity_log')) {
        activityInsertCount++
        return { rows: [] }
      }
      if (sql.includes('FROM client_sessions s')) {
        return {
          rows: [{
            sessionId: SESSION_ID,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            clientId: CLIENT_ID,
            clientName: 'Client One',
            logoUrl: null,
            userId: USER_ID,
            userEmail: `agency-${ACTOR_ID}-${CLIENT_ID}@portal-access.local`,
            userName: 'Paul (Agency)',
            userStatus: 'active'
          }]
        }
      }
      return { rows: [] }
    })
    transaction.mockImplementation(async callback => await callback({ query }))
    appendAudit.mockResolvedValue(undefined)
  })

  it.each(['', 'short key'])('rejects an invalid idempotency key before a portal mutation (%s)', async (key) => {
    const request = event(CLIENT_ID, ACTOR_ID, key)

    await expect(prepareGodModeClientPortalAccess(request, dependencies()))
      .rejects.toMatchObject({ statusCode: 428 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('creates one scoped session and replays the same token without duplicate access records', async () => {
    const firstEvent = event()
    const firstPrepared = await prepareGodModeClientPortalAccess(firstEvent, dependencies())
    const first = await executeClientPortalAccess(firstEvent, actor, CLIENT_ID, '127.0.0.1', 'vitest')
    await firstPrepared.persistTerminal(terminal())

    const replayEvent = event(CLIENT_ID, ACTOR_ID, IDEMPOTENCY_KEY, '99999999-9999-4999-8999-999999999999')
    const replayPrepared = await prepareGodModeClientPortalAccess(replayEvent, dependencies())
    const replay = await executeClientPortalAccess(replayEvent, actor, CLIENT_ID, '127.0.0.1', 'vitest')
    await replayPrepared.persistTerminal(terminal(ACTOR_ID, '99999999-9999-4999-8999-999999999999'))

    expect(replay.sessionId).toBe(first.sessionId)
    expect(replay.sessionToken).toBe(first.sessionToken)
    expect(sessionInsertCount).toBe(1)
    expect(activityInsertCount).toBe(1)
    expect(loginIncrementCount).toBe(1)
    expect(appendAudit).toHaveBeenCalledTimes(2)
    expect(String(query.mock.calls.find(call => String(call[0]).includes('UPDATE god_mode_execution_ledger'))?.[0])
      .match(/\$3::VARCHAR/g)).toHaveLength(2)
    expect(appendAudit.mock.calls[0]?.[0]).toEqual(terminal())
    expect(first.sessionToken).not.toBe(await digestPortalSessionToken(
      `${'a'.repeat(64)}\0${CLIENT_ID}\0${IDEMPOTENCY_KEY}`
    ))
    expect(query.mock.calls.find(call => String(call[0]).includes('FROM client_sessions s'))?.[1])
      .toEqual([
        SESSION_ID,
        CLIENT_ID,
        `agency-${ACTOR_ID}-${CLIENT_ID}@portal-access.local`,
        expect.any(String)
      ])
  })

  it('rejects same-key reuse for another client before creating a cross-client session', async () => {
    const firstEvent = event()
    const firstPrepared = await prepareGodModeClientPortalAccess(firstEvent, dependencies())
    await executeClientPortalAccess(firstEvent, actor, CLIENT_ID, null, null)
    await firstPrepared.persistTerminal(terminal())

    await expect(prepareGodModeClientPortalAccess(
      event(OTHER_CLIENT_ID, ACTOR_ID, IDEMPOTENCY_KEY, '99999999-9999-4999-8999-999999999999'),
      dependencies()
    )).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Idempotency key request does not match'
    })
    expect(sessionInsertCount).toBe(1)
  })

  it('replays a committed session after an ambiguous commit acknowledgement without duplicating it', async () => {
    const commitLost = vi.fn(async (callback) => {
      await callback({ query })
      throw new Error('commit response lost')
    })
    const ambiguousDependencies = { ...dependencies(), transaction: commitLost as never }
    const firstEvent = event()
    const firstPrepared = await prepareGodModeClientPortalAccess(firstEvent, ambiguousDependencies)
    const first = await executeClientPortalAccess(firstEvent, actor, CLIENT_ID, null, null)

    await expect(firstPrepared.persistTerminal(terminal())).rejects.toThrow('commit response lost')

    const replayEvent = event(CLIENT_ID, ACTOR_ID, IDEMPOTENCY_KEY, '99999999-9999-4999-8999-999999999999')
    const replayPrepared = await prepareGodModeClientPortalAccess(replayEvent, dependencies())
    const replay = await executeClientPortalAccess(replayEvent, actor, CLIENT_ID, null, null)
    await replayPrepared.persistTerminal(terminal(ACTOR_ID, '99999999-9999-4999-8999-999999999999'))

    expect(replay.sessionId).toBe(first.sessionId)
    expect(replay.sessionToken).toBe(first.sessionToken)
    expect(sessionInsertCount).toBe(1)
    expect(activityInsertCount).toBe(1)
  })

  it('scopes identical idempotency keys independently to the authenticated actor', async () => {
    const firstEvent = event()
    const firstPrepared = await prepareGodModeClientPortalAccess(firstEvent, dependencies())
    await executeClientPortalAccess(firstEvent, actor, CLIENT_ID, null, null)
    await firstPrepared.persistTerminal(terminal())

    const otherEvent = event(CLIENT_ID, OTHER_ACTOR_ID, IDEMPOTENCY_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const otherPrepared = await prepareGodModeClientPortalAccess(otherEvent, dependencies())
    expect(ledger).toHaveLength(2)
    await otherPrepared.persistTerminal({
      ...terminal(OTHER_ACTOR_ID, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      phase: 'failed'
    })
  })

  it('registers the exact coordinator through an isolated Nitro plugin', () => {
    const plugin = readFileSync('server/plugins/clientPortalGodModeExecution.ts', 'utf8')
    const coordinator = readFileSync('server/utils/clientPortal/godModeAccess.ts', 'utf8')

    expect(plugin).toContain('registerGodModeClientPortalAccessFamily()')
    expect(plugin).not.toContain('server/plugins/godModeExecution')
    expect(coordinator).toContain('transaction: transactionWithoutRetry')
  })
})
