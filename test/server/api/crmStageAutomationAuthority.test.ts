import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

interface TestEvent {
  body?: Record<string, unknown>
  context?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const STAGE_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const ASSIGNEE_ID = '55555555-5555-4555-8555-555555555555'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '66666666-6666-4666-8666-666666666666',
  clientId: CLIENT_ID,
  correlationId: '77777777-7777-4777-8777-777777777777',
  actorType: 'staff', actorId: ACTOR_ID, surface: 'agency_global',
  permissionSet: ['CLIENTS'], visibility: { ownerScoped: false }
}

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  resolveContext: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args),
  requireRole: (...args: unknown[]) => mocks.requireRole(...args)
}))
vi.mock('~~/server/utils/crm/searchContext', () => ({
  resolveAgencyCrmSearchContext: (...args: unknown[]) => mocks.resolveContext(...args),
  resolveTrustedCrmSystemContext: (...args: unknown[]) => mocks.resolveContext(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

const stageAutomationCreate = (await import('~~/server/api/crm/stage-automations/index.post')).default
const { runStageEntryAutomations } = await import('~~/server/utils/crm/stageAutomation')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: ACTOR_ID })
  mocks.requireRole.mockResolvedValue(undefined)
  mocks.resolveContext.mockResolvedValue(ownerContext)
  mocks.queryOne.mockImplementation(async (sql: string) => {
    if (/FROM crm_stages/.test(sql)) return { id: STAGE_ID }
    if (/INSERT INTO crm_stage_automations/.test(sql)) return { id: 'automation-1' }
    if (/FROM crm_opportunities/.test(sql)) return null
    return null
  })
  mocks.queryRows.mockImplementation(async (sql: string) => {
    if (/FROM crm_opportunities opportunity/.test(sql)) {
      return [{ id: OPPORTUNITY_ID, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }]
    }
    if (/FROM crm_stage_automations/.test(sql)) {
      return [{
        id: 'automation-1', client_id: CLIENT_ID, stage_id: STAGE_ID,
        object_type: 'opportunity', action: 'create_task', is_active: true,
        task_template: { title: 'Follow up', assigned_to: ASSIGNEE_ID }
      }]
    }
    return []
  })
  mocks.transaction.mockImplementation(async callback => await callback({ query: mocks.txQuery }))
  mocks.txQuery.mockImplementation(async (sql: string) => {
    if (/FROM crm_stages/.test(sql)) return { rows: [{ id: STAGE_ID }] }
    if (/FROM team_members member/.test(sql)) return { rows: [] }
    if (/FROM crm_opportunities opportunity/.test(sql)) {
      return { rows: [{ id: OPPORTUNITY_ID, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }] }
    }
    if (/FROM crm_tasks/.test(sql)) return { rows: [] }
    if (/INSERT INTO crm_tasks/.test(sql)) return { rows: [{ id: 'task-1' }] }
    if (/INSERT INTO crm_stage_automations/.test(sql)) return { rows: [{ id: 'automation-1' }] }
    return { rows: [] }
  })
})

describe('stage automation assignee authority', () => {
  it.each(['foreign', 'inactive'])('rejects a %s configured assignee inside the config transaction', async () => {
    await expect(stageAutomationCreate({ body: {
      client_id: CLIENT_ID,
      stage_id: STAGE_ID,
      task_template: { title: 'Follow up', assigned_to: ASSIGNEE_ID }
    }, context: {} } as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    const writes = [...mocks.queryOne.mock.calls, ...mocks.txQuery.mock.calls]
      .filter(([sql]) => /INSERT INTO crm_stage_automations/.test(String(sql)))
    expect(writes).toEqual([])
  })

  it.each([
    ['explicit assignee', { title: 'Follow up', assigned_to: ASSIGNEE_ID }, ACTOR_ID],
    ['owner fallback', { title: 'Follow up' }, ASSIGNEE_ID]
  ])('rejects a stale %s before automated task insertion', async (_label, taskTemplate, ownerId) => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_opportunities opportunity/.test(sql)) {
        return [{ id: OPPORTUNITY_ID, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }]
      }
      if (/FROM crm_stage_automations/.test(sql)) {
        return [{
          id: 'automation-1', client_id: CLIENT_ID, stage_id: STAGE_ID,
          object_type: 'opportunity', action: 'create_task', is_active: true,
          task_template: taskTemplate
        }]
      }
      return []
    })

    await expect(runStageEntryAutomations({
      clientId: CLIENT_ID,
      opportunityId: OPPORTUNITY_ID,
      fromStageId: null,
      toStageId: STAGE_ID,
      ownerId,
      changedBy: ACTOR_ID,
      accessContext: ownerContext
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.txQuery.mock.calls.some(([sql]) => /INSERT INTO crm_tasks/.test(String(sql)))).toBe(false)
  })
})
