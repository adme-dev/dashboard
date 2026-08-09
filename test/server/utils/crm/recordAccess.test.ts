import { describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import {
  crmVisibilityCond,
  requireAllCrmRecordsAccess,
  requireCrmRecordAccess,
  type CrmRecordRef,
  type TransactionClient
} from '~~/server/utils/crm/recordAccess'
import { createOpportunityStageTransitionService } from '~~/server/utils/crm/opportunityStageTransition'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const VISIBLE_ID = '33333333-3333-4333-8333-333333333333'
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444'
const ACTIVITY_ID = '55555555-5555-4555-8555-555555555555'
const TASK_ID = '66666666-6666-4666-8666-666666666666'
const STAGE_ID = '77777777-7777-4777-8777-777777777777'
const NEXT_STAGE_ID = '88888888-8888-4888-8888-888888888888'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '99999999-9999-4999-8999-999999999999',
  clientId: CLIENT_ID,
  correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

const teamContext: CrmSearchContext = {
  ...ownerContext,
  visibility: { ownerScoped: false }
}

type StoredRecord = Record<string, unknown> & {
  id: string
  client_id: string
  owner_id?: string | null
  assigned_to?: string | null
  created_by?: string | null
  target_type?: 'person' | 'company' | 'opportunity'
  target_id?: string
}

function record(type: CrmRecordRef['type'], overrides: Partial<StoredRecord> = {}): StoredRecord {
  return {
    id: VISIBLE_ID,
    client_id: CLIENT_ID,
    owner_id: ACTOR_ID,
    assigned_to: null,
    created_by: ACTOR_ID,
    name: `${type} record`,
    ...overrides
  }
}

function tableType(sql: string): CrmRecordRef['type'] | null {
  if (/\bcrm_people\b/.test(sql)) return 'person'
  if (/\bcrm_companies\b/.test(sql)) return 'company'
  if (/\bcrm_opportunities\b/.test(sql)) return 'opportunity'
  if (/\bcrm_activities\b/.test(sql)) return 'activity'
  if (/\bcrm_tasks\b/.test(sql)) return 'task'
  return null
}

function memoryClient(rows: Partial<Record<CrmRecordRef['type'], StoredRecord[]>>) {
  const statements: Array<{ sql: string, params: readonly unknown[] }> = []
  const client: TransactionClient = {
    async query(sql, params = []) {
      statements.push({ sql, params })
      const type = tableType(sql)
      if (!type) return { rows: [] }
      const id = params[0]
      const clientId = params[1]
      const candidates = (rows[type] ?? []).filter(row => row.id === id && row.client_id === clientId)

      // This fake models the authorization boundary expressed by the emitted SQL.
      // Returning hidden rows when the predicate disappears makes the tests catch
      // a real query regression rather than merely asserting that a mock ran.
      const visible = candidates.filter(row => {
        if (!ownerContext.visibility.ownerScoped) return true
        if (type === 'person' || type === 'company' || type === 'opportunity') {
          if (!/owner_id\s*=|assigned_to\s*=/.test(sql)) return true
          return row.owner_id === ACTOR_ID || row.assigned_to === ACTOR_ID
        }
        return true
      })
      return { rows: visible }
    }
  }
  return { client, statements }
}

describe('crmVisibilityCond', () => {
  it('expresses owner-or-assignee visibility for core records and no staff predicate for team scope', () => {
    expect(crmVisibilityCond(ownerContext, 'person', 'p')).toEqual({
      sql: '(p.owner_id = ? OR p.assigned_to = ?)',
      params: [ACTOR_ID, ACTOR_ID]
    })
    expect(crmVisibilityCond(ownerContext, 'company', 'c')).toEqual({
      sql: '(c.owner_id = ? OR c.assigned_to = ?)',
      params: [ACTOR_ID, ACTOR_ID]
    })
    expect(crmVisibilityCond(ownerContext, 'opportunity', 'o')).toEqual({
      sql: '(o.owner_id = ? OR o.assigned_to = ?)',
      params: [ACTOR_ID, ACTOR_ID]
    })
    expect(crmVisibilityCond(teamContext, 'person', 'p')).toBeNull()
  })

  it('builds current-target activity and actor-or-target task predicates', () => {
    const activity = crmVisibilityCond(ownerContext, 'activity', 'a')
    expect(activity?.params).toEqual([
      ACTOR_ID, ACTOR_ID,
      ACTOR_ID, ACTOR_ID,
      ACTOR_ID, ACTOR_ID
    ])
    expect(activity?.sql).toMatch(/a\.target_type = 'person'[\s\S]*crm_people/)
    expect(activity?.sql).toMatch(/a\.target_type = 'company'[\s\S]*crm_companies/)
    expect(activity?.sql).toMatch(/a\.target_type = 'opportunity'[\s\S]*crm_opportunities/)
    expect(activity?.sql).toMatch(/target\.client_id = a\.client_id/)
    expect(activity?.sql).toMatch(/target\.deleted_at IS NULL/)

    const task = crmVisibilityCond(ownerContext, 'task', 't')
    expect(task?.sql).toMatch(/t\.assigned_to = \? OR t\.created_by = \?/)
    expect(task?.sql).toContain("t.target_type = 'person'")
    expect(task?.params.slice(0, 2)).toEqual([ACTOR_ID, ACTOR_ID])
  })
})

describe('requireCrmRecordAccess', () => {
  it.each(['person', 'company', 'opportunity'] as const)(
    'hides a known %s ID outside owner scope with the same response as a missing ID',
    async type => {
      const { client } = memoryClient({
        [type]: [record(type, { id: HIDDEN_ID, owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', created_by: null })]
      })

      await expect(requireCrmRecordAccess(ownerContext, { type, id: HIDDEN_ID }, client))
        .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
      await expect(requireCrmRecordAccess(ownerContext, { type, id: VISIBLE_ID }, client))
        .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    }
  )

  it('returns the current authoritative row and locks it when a transaction client is supplied', async () => {
    const current = record('person', { first_name: 'Current' })
    const { client, statements } = memoryClient({ person: [current] })

    const result = await requireCrmRecordAccess(ownerContext, { type: 'person', id: VISIBLE_ID }, client)

    expect(result).toEqual({ type: 'person', id: VISIBLE_ID, clientId: CLIENT_ID, row: current })
    expect(statements[0]?.sql).toMatch(/FOR UPDATE/)
    expect(statements[0]?.params).toEqual([VISIBLE_ID, CLIENT_ID, ACTOR_ID, ACTOR_ID])
  })

  it('inherits activity visibility from its current client-qualified target', async () => {
    const activity = record('activity', {
      id: ACTIVITY_ID,
      target_type: 'person',
      target_id: HIDDEN_ID,
      owner_id: null,
      assigned_to: null,
      created_by: null
    })
    const hiddenTarget = record('person', {
      id: HIDDEN_ID,
      owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      created_by: null
    })
    const { client } = memoryClient({ activity: [activity], person: [hiddenTarget] })

    await expect(requireCrmRecordAccess(ownerContext, { type: 'activity', id: ACTIVITY_ID }, client))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('allows actor-assigned or actor-created tasks without leaking unrelated tasks', async () => {
    const assigned = record('task', {
      id: TASK_ID,
      assigned_to: ACTOR_ID,
      created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      target_type: 'person',
      target_id: HIDDEN_ID
    })
    const created = record('task', {
      id: VISIBLE_ID,
      assigned_to: null,
      created_by: ACTOR_ID,
      target_type: 'person',
      target_id: HIDDEN_ID
    })
    const unrelated = record('task', {
      id: HIDDEN_ID,
      assigned_to: null,
      created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      target_type: 'person',
      target_id: HIDDEN_ID
    })
    const hiddenTarget = record('person', {
      id: HIDDEN_ID,
      owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      created_by: null
    })
    const { client } = memoryClient({ task: [assigned, created, unrelated], person: [hiddenTarget] })

    await expect(requireCrmRecordAccess(ownerContext, { type: 'task', id: TASK_ID }, client))
      .resolves.toMatchObject({ id: TASK_ID })
    await expect(requireCrmRecordAccess(ownerContext, { type: 'task', id: VISIBLE_ID }, client))
      .resolves.toMatchObject({ id: VISIBLE_ID })
    await expect(requireCrmRecordAccess(ownerContext, { type: 'task', id: HIDDEN_ID }, client))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('allows an otherwise unrelated task only through a visible current target', async () => {
    const task = record('task', {
      id: TASK_ID,
      assigned_to: null,
      created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      target_type: 'company',
      target_id: VISIBLE_ID
    })
    const target = record('company')
    const { client } = memoryClient({ task: [task], company: [target] })

    await expect(requireCrmRecordAccess(ownerContext, { type: 'task', id: TASK_ID }, client))
      .resolves.toMatchObject({ id: TASK_ID })
  })

  it('authorizes every reference before returning a batch and fails closed on one hidden member', async () => {
    const visiblePerson = record('person')
    const hiddenCompany = record('company', {
      id: HIDDEN_ID,
      owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      created_by: null
    })
    const { client } = memoryClient({ person: [visiblePerson], company: [hiddenCompany] })

    await expect(requireAllCrmRecordsAccess(ownerContext, [
      { type: 'person', id: VISIBLE_ID },
      { type: 'company', id: HIDDEN_ID }
    ], client)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('locks reversed multi-record requests in one canonical type-and-UUID order while preserving caller order', async () => {
    const refs: CrmRecordRef[] = [
      { type: 'person', id: VISIBLE_ID },
      { type: 'company', id: HIDDEN_ID }
    ]
    const run = async (requested: CrmRecordRef[]) => {
      const lockOrder: string[] = []
      const client: TransactionClient = {
        async query(sql, params = []) {
          const type = tableType(sql)
          if (!type) return { rows: [] }
          lockOrder.push(`${type}:${String(params[0])}`)
          return { rows: [record(type, { id: String(params[0]) })] }
        }
      }
      const records = await requireAllCrmRecordsAccess(teamContext, requested, client)
      return { lockOrder, returnedOrder: records.map(item => `${item.type}:${item.id}`) }
    }

    const forward = await run(refs)
    const reverse = await run([...refs].reverse())

    expect(forward.lockOrder).toEqual(reverse.lockOrder)
    expect(forward.lockOrder).toEqual([
      `company:${HIDDEN_ID}`,
      `person:${VISIBLE_ID}`
    ])
    expect(forward.returnedOrder).toEqual(refs.map(ref => `${ref.type}:${ref.id}`))
    expect(reverse.returnedOrder).toEqual([...refs].reverse().map(ref => `${ref.type}:${ref.id}`))
  })
})

describe('opportunity stage authorization', () => {
  it('denies an owner-hidden move before the stage transition writes in the same transaction', async () => {
    const writes: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/^\s*(?:UPDATE|INSERT|DELETE)\b/i.test(sql)) writes.push(sql)
        if (/FROM crm_opportunities/.test(sql)) return { rows: [] }
        if (/FROM crm_stages/.test(sql)) {
          return { rows: [{ id: NEXT_STAGE_ID, code: 'qualified', probability: 25, is_won: false, is_lost: false }] }
        }
        return { rows: [] }
      })
    }
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: vi.fn() as never
    })

    const result = await service.move({
      clientId: CLIENT_ID,
      opportunityId: VISIBLE_ID,
      toStageId: NEXT_STAGE_ID,
      expectedStageId: STAGE_ID,
      actor: { type: 'team_member', id: ACTOR_ID },
      occurredAt: '2026-08-09T00:00:00.000Z',
      consentDecision: 'unknown',
      reason: 'Owner-scoped move'
    }, ownerContext)

    expect(result).toEqual({ status: 'opportunity_not_found' })
    expect(writes).toEqual([])
    expect(db.query.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/)
  })
})
