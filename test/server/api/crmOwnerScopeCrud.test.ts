import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

interface TestEvent {
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  params?: Record<string, string>
  context?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  getQuery: (event: TestEvent) => Record<string, unknown>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CALLER_CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const STALE_AUTH_ID = '44444444-4444-4444-8444-444444444444'
const RECORD_ID = '55555555-5555-4555-8555-555555555555'
const RELATED_ID = '66666666-6666-4666-8666-666666666666'
const STAGE_ID = '77777777-7777-4777-8777-777777777777'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '88888888-8888-4888-8888-888888888888',
  clientId: CLIENT_ID,
  correlationId: '99999999-9999-4999-8999-999999999999',
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireWriteAccess: vi.fn(),
  resolveContext: vi.fn(),
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  queryCount: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
  recordFieldChanges: vi.fn(),
  autoAssignOnCreate: vi.fn(),
  applyLifecycleEvent: vi.fn(),
  recomputeIfScorable: vi.fn(),
  recomputeHealthIfCustomer: vi.fn(),
  move: vi.fn(),
  publishEvent: vi.fn(),
  runStageEntryAutomations: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mocks.requireWriteAccess(...args),
  hasRole: () => false
}))

vi.mock('~~/server/utils/crm/searchContext', () => ({
  resolveAgencyCrmSearchContext: (...args: unknown[]) => mocks.resolveContext(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryCount: (...args: unknown[]) => mocks.queryCount(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

vi.mock('~~/server/utils/crm/audit', () => ({
  recordFieldChanges: (...args: unknown[]) => mocks.recordFieldChanges(...args)
}))

vi.mock('~~/server/utils/crm/assignment', () => ({
  autoAssignOnCreate: (...args: unknown[]) => mocks.autoAssignOnCreate(...args)
}))

vi.mock('~~/server/utils/crm/lifecycle', () => ({
  applyLifecycleEvent: (...args: unknown[]) => mocks.applyLifecycleEvent(...args)
}))

vi.mock('~~/server/utils/crm/scoreSignals', () => ({
  recomputeIfScorable: (...args: unknown[]) => mocks.recomputeIfScorable(...args)
}))

vi.mock('~~/server/utils/crm/healthSignals', () => ({
  recomputeHealthIfCustomer: (...args: unknown[]) => mocks.recomputeHealthIfCustomer(...args)
}))

vi.mock('~~/server/utils/crm/opportunityStageTransition', () => ({
  opportunityStageTransitionService: {
    move: (...args: unknown[]) => mocks.move(...args)
  }
}))

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: {
    publishEvent: (...args: unknown[]) => mocks.publishEvent(...args)
  }
}))

vi.mock('~~/server/utils/crm/stageAutomation', () => ({
  runStageEntryAutomations: (...args: unknown[]) => mocks.runStageEntryAutomations(...args)
}))

const handlers = {
  peopleList: (await import('~~/server/api/crm/people/index.get')).default,
  peopleCreate: (await import('~~/server/api/crm/people/index.post')).default,
  personGet: (await import('~~/server/api/crm/people/[id].get')).default,
  personPatch: (await import('~~/server/api/crm/people/[id].patch')).default,
  personDelete: (await import('~~/server/api/crm/people/[id].delete')).default,
  companiesList: (await import('~~/server/api/crm/companies/index.get')).default,
  companiesCreate: (await import('~~/server/api/crm/companies/index.post')).default,
  companyGet: (await import('~~/server/api/crm/companies/[id].get')).default,
  companyPatch: (await import('~~/server/api/crm/companies/[id].patch')).default,
  companyDelete: (await import('~~/server/api/crm/companies/[id].delete')).default,
  opportunitiesList: (await import('~~/server/api/crm/opportunities/index.get')).default,
  opportunitiesCreate: (await import('~~/server/api/crm/opportunities/index.post')).default,
  opportunityGet: (await import('~~/server/api/crm/opportunities/[id].get')).default,
  opportunityPatch: (await import('~~/server/api/crm/opportunities/[id].patch')).default,
  opportunityDelete: (await import('~~/server/api/crm/opportunities/[id].delete')).default,
  opportunityMove: (await import('~~/server/api/crm/opportunities/[id]/move.patch')).default,
  activitiesList: (await import('~~/server/api/crm/activities/index.get')).default,
  activitiesCreate: (await import('~~/server/api/crm/activities/index.post')).default,
  activityPatch: (await import('~~/server/api/crm/activities/[id].patch')).default,
  activityDelete: (await import('~~/server/api/crm/activities/[id].delete')).default,
  communicationsCreate: (await import('~~/server/api/crm/communications/index.post')).default,
  communicationDelete: (await import('~~/server/api/crm/communications/[id].delete')).default,
  tasksList: (await import('~~/server/api/crm/tasks/index.get')).default,
  tasksCreate: (await import('~~/server/api/crm/tasks/index.post')).default,
  taskPatch: (await import('~~/server/api/crm/tasks/[id].patch')).default,
  taskDelete: (await import('~~/server/api/crm/tasks/[id].delete')).default
}

function hiddenRow(type: string) {
  return {
    id: RECORD_ID,
    client_id: CLIENT_ID,
    owner_id: STALE_AUTH_ID,
    assigned_to: null,
    created_by: STALE_AUTH_ID,
    target_type: 'person',
    target_id: RELATED_ID,
    first_name: type === 'person' ? 'Hidden' : undefined,
    name: `Hidden ${type}`,
    title: `Hidden ${type}`,
    status: 'pending',
    due_at: null
  }
}

function visibleRow(type: string) {
  return {
    ...hiddenRow(type),
    id: RELATED_ID,
    owner_id: ACTOR_ID,
    created_by: ACTOR_ID,
    first_name: type === 'person' ? 'Visible' : undefined,
    name: `Visible ${type}`,
    title: `Visible ${type}`
  }
}

function event(input: Partial<TestEvent> = {}): TestEvent {
  return { context: {}, ...input }
}

function writeSql(sql: string) {
  return /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: STALE_AUTH_ID, role: 'member' })
  mocks.requireWriteAccess.mockResolvedValue(undefined)
  mocks.resolveContext.mockResolvedValue(ownerContext)
  mocks.queryRows.mockResolvedValue([])
  mocks.queryCount.mockResolvedValue(0)
  mocks.queryOne.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/crm_settings/.test(sql)) return { record_visibility: 'team' }
    if (/COUNT\(\*\)/.test(sql)) return { count: '0' }
    if (/crm_stages/.test(sql)) {
      return { id: STAGE_ID, probability: 25, is_won: false, is_lost: false }
    }
    if (/^\s*INSERT/i.test(sql)) return { id: RECORD_ID, client_id: params[0], created_by: params.at(-1) }
    if (/^\s*UPDATE/i.test(sql)) return hiddenRow('record')
    return hiddenRow('record')
  })
  mocks.execute.mockResolvedValue(1)
  mocks.txQuery.mockResolvedValue({ rows: [] })
  mocks.transaction.mockImplementation(async (callback: (db: { query: typeof mocks.txQuery }) => Promise<unknown>) => {
    return await callback({ query: mocks.txQuery })
  })
  mocks.recordFieldChanges.mockResolvedValue(undefined)
  mocks.autoAssignOnCreate.mockResolvedValue(null)
  mocks.applyLifecycleEvent.mockResolvedValue(undefined)
  mocks.recomputeIfScorable.mockResolvedValue(undefined)
  mocks.recomputeHealthIfCustomer.mockResolvedValue(undefined)
  mocks.move.mockResolvedValue({ status: 'opportunity_not_found' })
  mocks.publishEvent.mockResolvedValue({ status: 'published' })
  mocks.runStageEntryAutomations.mockResolvedValue(undefined)
})

describe('owner-scoped CRM lists', () => {
  it.each([
    ['people', handlers.peopleList],
    ['companies', handlers.companiesList],
    ['opportunities', handlers.opportunitiesList],
    ['tasks', handlers.tasksList]
  ] as const)('filters hidden %s rows using the fresh context predicate', async (type, handler) => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      const hasOwnerPredicate = /owner_id\s*=/.test(sql) && /assigned_to\s*=/.test(sql)
      const hasTaskPredicate = /created_by\s*=/.test(sql) && /target_type/.test(sql)
      return hasOwnerPredicate || hasTaskPredicate ? [visibleRow(type)] : [hiddenRow(type)]
    })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (/crm_settings/.test(sql)) return { record_visibility: 'team' }
      if (/COUNT\(\*\)/.test(sql)) return { count: '1' }
      return null
    })
    mocks.queryCount.mockResolvedValue(1)

    const result = await handler(event({ query: { client_id: CLIENT_ID } }) as never) as { items: Array<{ id: string }> }

    expect(result.items.map(item => item.id)).toEqual([RELATED_ID])
    expect(mocks.resolveContext).toHaveBeenCalledWith(expect.anything(), {
      clientId: CLIENT_ID,
      surface: 'agency_global'
    })
  })

  it.each([
    ['people', handlers.peopleList, 'crm_people', 'owner_id'],
    ['companies', handlers.companiesList, 'crm_companies', 'owner_id'],
    ['tasks', handlers.tasksList, 'crm_tasks', 'assigned_to']
  ] as const)('qualifies the %s owner predicate with a relation present in the query', async (_type, handler, relation, column) => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (!sql.includes(`FROM ${relation}`) || !sql.includes(`${relation}.${column}`)) {
        throw new Error(`missing FROM-clause entry for owner predicate in ${relation}`)
      }
      return []
    })

    await expect(handler(event({ query: { client_id: CLIENT_ID } }) as never))
      .resolves.toMatchObject({ items: [] })
  })

  it('returns a non-disclosing 404 when an activity target is hidden', async () => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_activities/.test(sql)) return [hiddenRow('activity')]
      return []
    })

    await expect(handlers.activitiesList(event({ query: {
      client_id: CLIENT_ID,
      target_type: 'person',
      target_id: RELATED_ID
    } }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })
})

describe('owner-scoped CRM detail routes', () => {
  it.each([
    ['person', handlers.personGet],
    ['company', handlers.companyGet],
    ['opportunity', handlers.opportunityGet]
  ] as const)('hides a known %s ID exactly like a missing record', async (_type, handler) => {
    mocks.queryRows.mockResolvedValue([])
    mocks.queryOne.mockResolvedValue(hiddenRow(_type))

    await expect(handler(event({
      params: { id: RECORD_ID },
      query: { client_id: CLIENT_ID }
    }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })
})

describe('owner-scoped CRM create routes', () => {
  it.each([
    ['person/company', handlers.peopleCreate, {
      client_id: CLIENT_ID, company_id: RELATED_ID, first_name: 'Linked'
    }],
    ['opportunity/person', handlers.opportunitiesCreate, {
      client_id: CLIENT_ID, name: 'Linked opportunity', stage_id: STAGE_ID, person_id: RELATED_ID
    }],
    ['activity/target', handlers.activitiesCreate, {
      client_id: CLIENT_ID, target_type: 'person', target_id: RELATED_ID, title: 'Hidden target note'
    }],
    ['task/target', handlers.tasksCreate, {
      client_id: CLIENT_ID, target_type: 'person', target_id: RELATED_ID, title: 'Hidden target task'
    }]
  ] as const)('authorizes the %s relation before any insert', async (_surface, handler, body) => {
    const writes: string[] = []
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (writeSql(sql)) writes.push(sql)
      return { rows: [] }
    })
    mocks.queryRows.mockResolvedValue([])

    await expect(handler(event({ body }) as never))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    expect(writes).toEqual([])
  })

  it('creates an unlinked company with the authoritative context client and actor in one transaction', async () => {
    mocks.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/crm_custom_fields/.test(sql)) return { rows: [] }
      if (/INSERT INTO crm_companies/.test(sql)) {
        return { rows: [{ id: RECORD_ID, client_id: params[0], created_by: params.at(-1) }] }
      }
      return { rows: [] }
    })

    const result = await handlers.companiesCreate(event({ body: {
      client_id: CALLER_CLIENT_ID,
      name: 'Authoritative company'
    } }) as never) as { item: { client_id: string, created_by: string } }

    expect(result.item).toMatchObject({ client_id: CLIENT_ID, created_by: ACTOR_ID })
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it('keeps agency activity score, health, and lifecycle follow-ons under the fresh actor scope', async () => {
    const unsafeFollowOnWrites: string[] = []
    mocks.recomputeIfScorable.mockImplementation(async (...args: unknown[]) => {
      if (args[4] !== ownerContext) unsafeFollowOnWrites.push('score')
    })
    mocks.recomputeHealthIfCustomer.mockImplementation(async (...args: unknown[]) => {
      if (args[4] !== ownerContext) unsafeFollowOnWrites.push('health')
    })
    mocks.applyLifecycleEvent.mockImplementation(async (input: { context?: CrmSearchContext }) => {
      if (input.context !== ownerContext) unsafeFollowOnWrites.push('lifecycle')
    })
    mocks.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/SELECT person\.\*/.test(sql)) return { rows: [visibleRow('person')] }
      if (/INSERT INTO crm_activities/.test(sql)) {
        return { rows: [{ id: RECORD_ID, client_id: params[0] }] }
      }
      return { rows: [] }
    })

    await handlers.activitiesCreate(event({ body: {
      client_id: CLIENT_ID,
      target_type: 'person',
      target_id: RELATED_ID,
      title: 'Actor-scoped follow-on'
    } }) as never)

    expect(unsafeFollowOnWrites).toEqual([])
  })

  it('keeps opportunity lifecycle follow-ons under the fresh actor scope after an ownership flip', async () => {
    const unsafeFollowOnWrites: string[] = []
    mocks.applyLifecycleEvent.mockImplementation(async (input: { entityId?: string | null, context?: CrmSearchContext }) => {
      if (input.entityId && input.context !== ownerContext) unsafeFollowOnWrites.push('lifecycle')
    })
    mocks.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/SELECT person\.\*/.test(sql)) return { rows: [visibleRow('person')] }
      if (/FROM crm_stages/.test(sql)) {
        return { rows: [{ id: STAGE_ID, probability: 25, is_won: false, is_lost: false }] }
      }
      if (/INSERT INTO crm_opportunities/.test(sql)) {
        return { rows: [{ id: RECORD_ID, client_id: params[0], owner_id: STALE_AUTH_ID }] }
      }
      return { rows: [] }
    })

    await handlers.opportunitiesCreate(event({ body: {
      client_id: CLIENT_ID,
      name: 'Actor-scoped opportunity',
      stage_id: STAGE_ID,
      person_id: RELATED_ID
    } }) as never)

    expect(unsafeFollowOnWrites).toEqual([])
  })

  it('returns the canonical non-disclosing 404 for an orphan communication create', async () => {
    await expect(handlers.communicationsCreate(event({ body: {
      client_id: CLIENT_ID,
      channel: 'note'
    } }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.txQuery.mock.calls.some(([sql]) => /INSERT INTO crm_communications/.test(String(sql)))).toBe(false)
  })
})

describe('owner-scoped CRM mutation routes', () => {
  it.each([
    ['person patch', handlers.personPatch, 'patch', { client_id: CLIENT_ID, first_name: 'Changed' }],
    ['company patch', handlers.companyPatch, 'patch', { client_id: CLIENT_ID, name: 'Changed' }],
    ['opportunity patch', handlers.opportunityPatch, 'patch', { client_id: CLIENT_ID, name: 'Changed' }],
    ['activity patch', handlers.activityPatch, 'patch', { client_id: CLIENT_ID, title: 'Changed' }],
    ['task patch', handlers.taskPatch, 'patch', { client_id: CLIENT_ID, title: 'Changed' }],
    ['person delete', handlers.personDelete, 'delete', null],
    ['company delete', handlers.companyDelete, 'delete', null],
    ['opportunity delete', handlers.opportunityDelete, 'delete', null],
    ['activity delete', handlers.activityDelete, 'delete', null],
    ['task delete', handlers.taskDelete, 'delete', null]
  ] as const)('locks and denies hidden %s before mutation', async (_surface, handler, method, body) => {
    const writes: string[] = []
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (writeSql(sql)) writes.push(sql)
      return { rows: [] }
    })

    const request = method === 'patch'
      ? event({ params: { id: RECORD_ID }, body: body ?? undefined })
      : event({ params: { id: RECORD_ID }, query: { client_id: CLIENT_ID } })

    await expect(handler(request as never))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    expect(writes).toEqual([])
  })

  it('passes fresh record authority into the opportunity move transaction service', async () => {
    await expect(handlers.opportunityMove(event({
      params: { id: RECORD_ID },
      body: { client_id: CLIENT_ID, stage_id: STAGE_ID, expected_stage_id: RELATED_ID }
    }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.move).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      opportunityId: RECORD_ID,
      actor: { type: 'team_member', id: ACTOR_ID }
    }), ownerContext)
  })

  it('returns the canonical non-disclosing 404 before deleting an orphan communication', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (/SELECT \* FROM crm_communications/.test(sql)) {
        return { rows: [{ id: RECORD_ID, client_id: CLIENT_ID, person_id: null, company_id: null }] }
      }
      if (/UPDATE crm_communications/.test(sql)) {
        throw new Error('orphan communication was mutated')
      }
      return { rows: [] }
    })

    await expect(handlers.communicationDelete(event({
      params: { id: RECORD_ID },
      query: { client_id: CLIENT_ID }
    }) as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.txQuery.mock.calls.some(([sql]) => /UPDATE crm_communications/.test(String(sql)))).toBe(false)
  })
})
