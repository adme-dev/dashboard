import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { seedGodModeRouteAuditState } from '../../../server/utils/godMode/featureGate'

const mockRequireAuth = vi.fn()
const mockExecuteGodModeBannerProjectCreation = vi.fn()
const routeQuery = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({
  executeGodModeBannerProjectCreation: (...args: unknown[]) => mockExecuteGodModeBannerProjectCreation(...args)
}))

const {
  executeGodModeBannerProjectCreation,
  prepareGodModeBannerProjectCreation
} = await vi.importActual<typeof import('../../../server/utils/banner/godModeProjectCreation')>(
  '../../../server/utils/banner/godModeProjectCreation'
)
const { default: createProject } = await import('../../../server/api/agency/banner-studio/projects/index.post')
const projectCreationRouteSource = readFileSync(
  new URL('../../../server/api/agency/banner-studio/projects/index.post.ts', import.meta.url),
  'utf8'
)

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
    mockRequireAuth.mockResolvedValue({ id: ACTOR_ID })
    routeQuery.mockResolvedValue({
      rows: [{
        id: PROJECT_ID,
        name: 'Leapmotor animated MRec',
        clientId: 'client-leapmotor',
        canvasData: {},
        thumbnailUrl: null,
        status: 'draft',
        tags: ['leapmotor', 'mrec'],
        createdBy: ACTOR_ID,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z'
      }]
    })
    mockExecuteGodModeBannerProjectCreation.mockImplementation(async (_event, create) => await (create as (db: { query: typeof routeQuery }) => Promise<unknown>)({ query: routeQuery }))
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
    const successTerminal = {
      actorUserId: ACTOR_ID,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      channel: 'application' as const,
      routeOrTool: 'POST /api/agency/banner-studio/projects',
      phase: 'succeeded' as const,
      bypassedControls: [],
      outcomeCode: 'http_2xx',
      emergencyDisabled: false
    }

    const project = await executeGodModeBannerProjectCreation(event, create)
    await prepared.persistTerminal(successTerminal)

    expect(project).toEqual({ id: PROJECT_ID, name: 'Launch' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(audit.mock.calls[0]?.[0]).toEqual(successTerminal)
    expect(audit.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ query }))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE god_mode_execution_ledger'), expect.arrayContaining(['succeeded', PROJECT_ID]))
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('execution_metadata'),
      expect.arrayContaining(['b'.repeat(64)])
    )
  })

  it('posts an uploaded MRec canvas as an editable draft without rendering or publishing it', async () => {
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
    const project = await createProject({
      body: {
        name: '  Leapmotor animated MRec  ',
        clientId: 'client-leapmotor',
        canvasData,
        tags: ['leapmotor', 'mrec']
      }
    } as never)

    expect(project.status).toBe('draft')
    expect(project.name).toBe('Leapmotor animated MRec')
    expect(project.clientId).toBe('client-leapmotor')
    expect(project.tags).toEqual(['leapmotor', 'mrec'])
    expect(mockRequireAuth).toHaveBeenCalledTimes(1)
    expect(mockExecuteGodModeBannerProjectCreation).toHaveBeenCalledTimes(1)
    expect(routeQuery).toHaveBeenCalledTimes(1)
    expect(routeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO banner_projects'),
      ['Leapmotor animated MRec', 'client-leapmotor', JSON.stringify(canvasData), ['leapmotor', 'mrec'], ACTOR_ID]
    )
    const [insertSql, params] = routeQuery.mock.calls[0]
    expect(String(insertSql)).toMatch(/^\s*INSERT INTO banner_projects/)
    expect(JSON.parse((params as string[])[2])).toEqual(canvasData)
    expect(JSON.parse((params as string[])[2]).mrec.layers[0]).toMatchObject({ src: assetUrl, fit: 'cover' })
    expect(JSON.parse((params as string[])[2]).mrec.layers[1]).toMatchObject({ src: assetUrl, fit: 'contain' })
    expect(JSON.parse((params as string[])[2]).mrec.layers[2]).toMatchObject({ type: 'button', text: 'BOOK A TEST DRIVE' })
    expect(mockExecuteGodModeBannerProjectCreation).toHaveBeenCalledWith(expect.anything(), expect.any(Function))
    expect([...projectCreationRouteSource.matchAll(/^import\s+[^'"\n]+from\s+['"]([^'"]+)['"]/gm)].map(([, source]) => source)).toEqual([
      '~~/server/utils/auth',
      '~~/server/utils/banner/godModeProjectCreation'
    ])
    expect(projectCreationRouteSource).not.toMatch(/\b(?:render(?:Job|Banner)?|publish(?:Banner|ToAdPlatform)?|enqueue|queue|export(?:Banner)?|upload(?:Asset)?)[A-Za-z0-9_]*\s*\(/i)
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

  it('preserves the banner unreplayable response for an existing in-progress attempt', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state: 'in_progress', result_reference: null, route_or_tool: 'POST /api/agency/banner-studio/projects', request_digest: 'b'.repeat(64) }] }
      }
      return { rows: [] }
    })

    await expect(prepareGodModeBannerProjectCreation(request(), dependencies)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'God mode project creation is not safely replayable'
    })
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

    expect(query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT god_mode_coordinated_mutation')
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

    expect(query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT god_mode_coordinated_mutation')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE god_mode_execution_ledger'), expect.arrayContaining(['failed', null]))
    const failedAudit = audit.mock.calls[0]?.[0]
    expect(failedAudit).toEqual(expect.objectContaining({ phase: 'failed' }))
    expect(failedAudit).not.toHaveProperty('entityId')
  })
})
