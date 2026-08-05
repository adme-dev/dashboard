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

  it('preserves an uploaded MRec canvas as an editable draft without rendering or publishing it', async () => {
    const assetUrl = 'https://assets.xeroflow.test/leapmotor-c10.png'
    const canvasData = {
      mrec: {
        bgColor: '#7fbfba',
        layers: [
          { id: 1, type: 'image', name: 'Ambient Fill', src: assetUrl, srcType: 'image', fit: 'cover', x: 0, y: 0, w: 300, h: 250, zIndex: 0, opacity: 0.5, animIn: 'kenBurns', animInDur: 0.4, startTime: 0, endTime: 5, ease: 'none', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 },
          { id: 2, type: 'image', name: 'Leapmotor Artwork', src: assetUrl, srcType: 'image', fit: 'contain', x: 25, y: 0, w: 250, h: 250, zIndex: 2, opacity: 1, animIn: 'slideU', animInDur: 0.7, startTime: 0.15, endTime: 5, ease: 'power2.out', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 },
          { id: 3, type: 'button', name: 'Test Drive CTA', text: 'BOOK A TEST DRIVE', x: 76, y: 216, w: 148, h: 24, zIndex: 4, opacity: 1, bgColor: '#34e52e', textColor: '#083e35', borderRadius: 12, fontSize: 12, fontWeight: 800, animIn: 'slideU', animInDur: 0.55, startTime: 1.6, endTime: 4.65, ease: 'back.out(1.7)', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 }
        ]
      }
    }
    const event = request('banner-create-canvas-12345678')
    const prepared = await prepareGodModeBannerProjectCreation(event, dependencies)
    const create = vi.fn(async (db: { query: typeof query }) => {
      const result = await db.query(
        'INSERT INTO banner_projects (name, canvas_data) VALUES ($1, $2) RETURNING id, name, canvas_data AS "canvasData", status',
        ['Leapmotor animated MRec', JSON.stringify(canvasData)]
      )
      return {
        ...result.rows[0],
        status: 'draft',
        canvasData
      }
    })

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

    expect(project.status).toBe('draft')
    expect(project.canvasData).toEqual(canvasData)
    expect(project.canvasData.mrec.layers[0]).toMatchObject({ src: assetUrl, fit: 'cover' })
    expect(project.canvasData.mrec.layers[1]).toMatchObject({ src: assetUrl, fit: 'contain' })
    expect(project.canvasData.mrec.layers[2]).toMatchObject({ type: 'button', text: 'BOOK A TEST DRIVE' })
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO banner_projects'),
      ['Leapmotor animated MRec', JSON.stringify(canvasData)]
    )
    expect(query.mock.calls.flatMap(([sql]) => String(sql).match(/render|publish/gi) ?? [])).toEqual([])
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
