import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ACTION_ITEM_ID = '44444444-4444-4444-8444-444444444444'
const TARGET_ID = '55555555-5555-4555-8555-555555555555'
const TASK_ID = '66666666-6666-4666-8666-666666666666'
const HIDDEN_TARGET_ID = '77777777-7777-4777-8777-777777777777'

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
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
  recordFieldChanges: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

vi.mock('~~/server/utils/crm/audit', () => ({
  recordFieldChanges: (...args: unknown[]) => mocks.recordFieldChanges(...args)
}))

const { convertActionItemToCrmTask } = await import('~~/server/utils/crm/meetingBridge')

const actionItem = {
  id: ACTION_ITEM_ID,
  meeting_session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  meeting_title: 'Review',
  source_artifact_id: null,
  content: 'Follow up',
  due_at: null,
  crm_task_id: TASK_ID
}

const target = {
  client_id: CLIENT_ID,
  target_type: 'person' as const,
  target_id: TARGET_ID
}

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    client_id: CLIENT_ID,
    owner_id: ACTOR_ID,
    assigned_to: null,
    created_by: ACTOR_ID,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryRows.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/FROM crm_people person/.test(sql) && params[0] === TARGET_ID) return [record(TARGET_ID)]
    return []
  })
  mocks.queryOne.mockImplementation(async (sql: string) => {
    if (/FROM crm_tasks/.test(sql)) {
      return record(TASK_ID, {
        assigned_to: null,
        created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        target_type: 'person',
        target_id: HIDDEN_TARGET_ID
      })
    }
    if (/FROM office_meeting_action_items/.test(sql)) return { ...actionItem }
    return null
  })
  mocks.transaction.mockImplementation(async callback => await callback({ query: mocks.txQuery }))
  mocks.txQuery.mockResolvedValue({ rows: [] })
  mocks.recordFieldChanges.mockResolvedValue(undefined)
})

describe('meeting action idempotent conversion authority', () => {
  it('hides an existing linked task outside the supplied actor scope', async () => {
    mocks.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/office_meeting_action_items/.test(sql)) return { rows: [{ ...actionItem }] }
      if (/FROM crm_tasks task/.test(sql) && params[0] === TASK_ID) {
        return { rows: [record(TASK_ID, {
          assigned_to: null,
          created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          target_type: 'person',
          target_id: HIDDEN_TARGET_ID
        })] }
      }
      if (/FROM crm_people person/.test(sql) && params[0] === HIDDEN_TARGET_ID) return { rows: [] }
      return { rows: [] }
    })

    await expect(convertActionItemToCrmTask(actionItem, target, {
      actor: ACTOR_ID,
      mode: 'manual_office',
      accessContext: ownerContext
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('does not disclose an idempotent task linked from another client', async () => {
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (/FROM crm_tasks/.test(sql)) return record(TASK_ID, { client_id: OTHER_CLIENT_ID })
      if (/FROM office_meeting_action_items/.test(sql)) return { ...actionItem }
      return null
    })
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (/office_meeting_action_items/.test(sql)) return { rows: [{ ...actionItem }] }
      if (/FROM crm_tasks task/.test(sql)) return { rows: [] }
      return { rows: [] }
    })

    await expect(convertActionItemToCrmTask(actionItem, target, {
      actor: ACTOR_ID,
      mode: 'manual_office',
      accessContext: ownerContext
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })
})
