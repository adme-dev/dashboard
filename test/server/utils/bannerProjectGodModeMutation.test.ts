import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import { seedGodModeRouteAuditState } from '../../../server/utils/godMode/featureGate'
import {
  executeGodModeBannerProjectCreation,
  prepareGodModeBannerProjectCreation
} from '../../../server/utils/banner/godModeProjectCreation'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

function request(idempotencyKey = 'banner-create-12345678') {
  const event = {
    method: 'POST',
    path: '/api/agency/banner-studio/projects',
    context: { user: { id: ACTOR_ID } },
    node: {
      req: {
        originalUrl: '/api/agency/banner-studio/projects',
        headers: { 'host': 'app.xeroflow.test', 'idempotency-key': idempotencyKey },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(event, {
    actorUserId: ACTOR_ID,
    correlationId: '33333333-3333-4333-8333-333333333333',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: 'POST /api/agency/banner-studio/projects',
    emergencyDisabled: false
  })
  return event
}

describe('God mode banner project creation coordination', () => {
  const audit = vi.fn()
  const query = vi.fn()
  const digestRequest = vi.fn(async () => 'b'.repeat(64))
  const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))
  const dependencies = { transaction, appendAudit: audit, digestRequest }

  beforeEach(() => {
    vi.clearAllMocks()
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('INSERT INTO banner_projects')) return { rows: [{ id: PROJECT_ID, name: 'Launch' }] }
      return { rows: [] }
    })
  })

  it.each([
    ['missing', ''],
    ['invalid', 'short key']
  ])('rejects a %s idempotency key before admitting the owner mutation', async (_case, key) => {
    const event = request(key)
    await expect(prepareGodModeBannerProjectCreation(event, dependencies))
      .rejects.toMatchObject({ statusCode: 428 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('commits the project, success terminal, and succeeded ledger state through one transaction', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerProjectCreation(event, dependencies)
    const create = vi.fn(async (db: { query: typeof query }) => (await db.query('INSERT INTO banner_projects RETURNING id')).rows[0])

    const project = await executeGodModeBannerProjectCreation(event, create)
    await prepared.persistTerminal({
      actorUserId: ACTOR_ID,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'POST /api/agency/banner-studio/projects',
      phase: 'succeeded',
      bypassedControls: [],
      outcomeCode: 'http_2xx',
      emergencyDisabled: false
    })

    expect(project).toEqual({ id: PROJECT_ID, name: 'Launch' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'succeeded', entityType: 'banner_project', entityId: PROJECT_ID
    }), expect.objectContaining({ query }))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE god_mode_execution_ledger'), expect.arrayContaining(['succeeded', PROJECT_ID]))
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('execution_metadata'),
      expect.arrayContaining(['b'.repeat(64)])
    )
  })

  it('replays a completed request without creating a second project', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state: 'succeeded', result_reference: PROJECT_ID, route_or_tool: 'POST /api/agency/banner-studio/projects', request_digest: 'b'.repeat(64) }] }
      }
      if (sql.includes('FROM banner_projects')) return { rows: [{ id: PROJECT_ID, name: 'Launch' }] }
      return { rows: [] }
    })
    const event = request()
    const prepared = await prepareGodModeBannerProjectCreation(event, dependencies)
    const create = vi.fn()

    const project = await executeGodModeBannerProjectCreation(event, create)
    await prepared.persistTerminal({
      actorUserId: ACTOR_ID,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'POST /api/agency/banner-studio/projects',
      phase: 'succeeded',
      bypassedControls: [],
      outcomeCode: 'http_2xx',
      emergencyDisabled: false
    })

    expect(project).toEqual({ id: PROJECT_ID, name: 'Launch' })
    expect(create).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('state = \'succeeded\''), expect.anything())
  })

  it('rejects reuse of an idempotency key for a different request body', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state: 'succeeded', result_reference: PROJECT_ID, route_or_tool: 'POST /api/agency/banner-studio/projects', request_digest: 'a'.repeat(64) }] }
      }
      return { rows: [] }
    })

    await expect(prepareGodModeBannerProjectCreation(request(), dependencies))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: 'Idempotency key request does not match' })
  })

  it('rolls back a failed insert savepoint and durably records a failed terminal', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerProjectCreation(event, dependencies)

    await expect(executeGodModeBannerProjectCreation(event, async () => {
      throw new Error('insert failed')
    })).rejects.toThrow('insert failed')
    await prepared.persistTerminal({
      actorUserId: ACTOR_ID,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'POST /api/agency/banner-studio/projects',
      phase: 'failed',
      bypassedControls: [],
      outcomeCode: 'http_5xx',
      emergencyDisabled: false
    })

    expect(query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT god_mode_banner_project_create')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE god_mode_execution_ledger'), expect.arrayContaining(['failed']))
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed' }), expect.objectContaining({ query }))
  })

  it('rolls back a successful insert when the request terminal is failed', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerProjectCreation(event, dependencies)
    await executeGodModeBannerProjectCreation(event, async db =>
      (await db.query('INSERT INTO banner_projects RETURNING id')).rows[0] as { id: string, name: string }
    )

    await prepared.persistTerminal({
      actorUserId: ACTOR_ID,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'POST /api/agency/banner-studio/projects',
      phase: 'failed',
      bypassedControls: [],
      outcomeCode: 'http_5xx',
      emergencyDisabled: false
    })

    expect(query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT god_mode_banner_project_create')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE god_mode_execution_ledger'), expect.arrayContaining(['failed', null]))
    const failedAudit = audit.mock.calls[0]?.[0]
    expect(failedAudit).toEqual(expect.objectContaining({ phase: 'failed' }))
    expect(failedAudit).not.toHaveProperty('entityId')
  })
})
