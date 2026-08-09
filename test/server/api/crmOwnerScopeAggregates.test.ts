import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

interface TestEvent { query?: Record<string, unknown>, context?: Record<string, unknown> }
const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const VISIBLE_ID = '33333333-3333-4333-8333-333333333333'
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '55555555-5555-4555-8555-555555555555',
  clientId: CLIENT_ID,
  correlationId: '66666666-6666-4666-8666-666666666666',
  actorType: 'staff', actorId: ACTOR_ID, surface: 'agency_global',
  permissionSet: ['CLIENTS'], visibility: { ownerScoped: true }
}

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), resolveContext: vi.fn(), queryRows: vi.fn(), queryOne: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mocks.requireAuth(...args) }))
vi.mock('~~/server/utils/crm/searchContext', () => ({ resolveAgencyCrmSearchContext: (...args: unknown[]) => mocks.resolveContext(...args) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args)
}))

const pipeline = (await import('~~/server/api/crm/pipeline.get')).default
const performance = (await import('~~/server/api/crm/analytics/performance.get')).default
const health = (await import('~~/server/api/crm/health/index.get')).default
const scoring = (await import('~~/server/api/crm/scoring/index.get')).default
const audit = (await import('~~/server/api/crm/audit/index.get')).default
const quotes = (await import('~~/server/api/crm/quotes.get')).default
const { gatherOppContext } = await import('~~/server/utils/crm/aiSignals')

const event = (query: Record<string, unknown>): TestEvent => ({ query, context: {} })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: 'stale' })
  mocks.resolveContext.mockResolvedValue(ownerContext)
  mocks.queryRows.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/SELECT opportunity\.\*/.test(sql)) return []
    if (/GROUP BY stage_id/.test(sql)) {
      return /crm_opportunities\.owner_id\s*=/.test(sql)
        ? [{ stage_id: 'stage', count: '1', total: '10', weighted: '5' }]
        : [{ stage_id: 'stage', count: '2', total: '1010', weighted: '505' }]
    }
    if (/FROM crm_opportunities/.test(sql)) {
      const rows = [
        { id: VISIBLE_ID, stage_id: 'stage', amount: 10, probability: 50, status: 'won', owner_id: ACTOR_ID, created_at: '2026-08-01', actual_close_date: '2026-08-02' },
        { id: HIDDEN_ID, stage_id: 'stage', amount: 1000, probability: 50, status: 'won', owner_id: 'hidden-owner', created_at: '2026-08-01', actual_close_date: '2026-08-02' }
      ]
      return /crm_opportunities\.owner_id\s*=/.test(sql) ? rows.slice(0, 1) : rows
    }
    if (/FROM crm_scores/.test(sql)) {
      const rows = [
        { target_id: VISIBLE_ID, total_score: 90 },
        { target_id: HIDDEN_ID, total_score: 5 }
      ]
      return /(?:crm_people|crm_companies)\.owner_id\s*=/.test(sql) ? rows.slice(0, 1) : rows
    }
    if (/FROM crm_audit_log/.test(sql)) return [{ id: 'audit-hidden', field: 'name' }]
    return []
  })
  mocks.queryOne.mockResolvedValue(null)
})

describe('filter-before-aggregate CRM surfaces', () => {
  it('aggregates the pipeline only after applying owner visibility', async () => {
    await expect(pipeline(event({ client_id: CLIENT_ID }) as never)).resolves.toMatchObject({
      openTotal: 10,
      byStage: { stage: { count: 1 } }
    })
  })

  it('does not create a performance bucket or won amount for a hidden owner', async () => {
    const result = await performance(event({ client_id: CLIENT_ID }) as never) as { items: Array<{ owner_id: string, wonValue: number }> }
    expect(result.items).toEqual([expect.objectContaining({ owner_id: ACTOR_ID, wonValue: 10 })])
  })

  it.each([
    ['health', health],
    ['lead', scoring]
  ] as const)('filters %s score rows through their current protected target', async (_kind, handler) => {
    const result = await handler(event({ client_id: CLIENT_ID, target_type: 'person' }) as never) as { items: Array<{ target_id: string }> }
    expect(result.items.map(item => item.target_id)).toEqual([VISIBLE_ID])
  })

  it('binds owner visibility parameters after the health query parameters', async () => {
    await health(event({ client_id: CLIENT_ID, target_type: 'person' }) as never)

    const [sql, params] = mocks.queryRows.mock.calls.find(([candidate]) =>
      /FROM crm_scores/.test(String(candidate)))!
    expect(sql).toMatch(/crm_people\.owner_id = \$3 OR crm_people\.assigned_to = \$4/)
    expect(params).toEqual([CLIENT_ID, 'person', ACTOR_ID, ACTOR_ID])
  })

  it('authorizes linked CRM records before AI signal names or communications are queried', async () => {
    mocks.queryRows.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/SELECT opportunity\.\*/.test(sql) && params[0] === VISIBLE_ID) {
        return [{ id: VISIBLE_ID, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }]
      }
      if (/SELECT person\.\*/.test(sql)) return []
      return []
    })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (/FROM crm_opportunities o/.test(sql)) {
        return {
          name: 'Visible opportunity', status: 'open', amount: '10',
          person_id: HIDDEN_ID, company_id: null, created_at: '2026-08-01T00:00:00.000Z',
          stage_name: 'Open', stage_is_won: false, stage_is_lost: false
        }
      }
      if (/FROM crm_communications|FROM crm_people/.test(sql)) {
        throw new Error('linked-record data queried before authorization')
      }
      return null
    })

    await expect(gatherOppContext(ownerContext, VISIBLE_ID))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    expect(mocks.queryOne.mock.calls.some(([sql]) =>
      /FROM crm_communications|FROM crm_people/.test(String(sql)))).toBe(false)
  })

  it('does not return audit rows for a hidden protected entity', async () => {
    await expect(audit(event({
      client_id: CLIENT_ID,
      entity_type: 'person',
      entity_id: HIDDEN_ID,
      limit: 50
    }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    expect(mocks.queryRows.mock.calls.some(([sql]) => /FROM crm_audit_log/.test(String(sql)))).toBe(false)
  })

  it('returns the same 404 for a hidden or missing quote id', async () => {
    mocks.queryOne.mockResolvedValue(null)

    await expect(quotes(event({ client_id: CLIENT_ID, quote_id: HIDDEN_ID }) as never))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })
})
