import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const testGlobal = globalThis as typeof globalThis & {
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const VISIBLE_ID = '33333333-3333-4333-8333-333333333333'
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444'
const CHILD_ID = '55555555-5555-4555-8555-555555555555'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '66666666-6666-4666-8666-666666666666',
  clientId: CLIENT_ID,
  correlationId: '77777777-7777-4777-8777-777777777777',
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
  txQuery: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

const { listDocuments } = await import('~~/server/utils/crm/documentsDb')
const { createComm, listTimeline } = await import('~~/server/utils/crm/commsDb')
const { listRelationships } = await import('~~/server/utils/crm/relationshipsDb')
const { listLineItems, updateLineItem } = await import('~~/server/utils/crm/lineItemsDb')

function baseRecord(id: string) {
  return { id, client_id: CLIENT_ID, owner_id: id === VISIBLE_ID ? ACTOR_ID : 'other', assigned_to: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async callback => await callback({ query: mocks.txQuery }))
  mocks.queryRows.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/FROM crm_(?:people|companies|opportunities)\s+(?:person|company|opportunity)/.test(sql)) {
      const id = String(params[0])
      return id === VISIBLE_ID ? [baseRecord(id)] : []
    }
    if (/FROM crm_documents/.test(sql)) return [{ id: CHILD_ID, target_type: 'person', target_id: HIDDEN_ID }]
    if (/FROM crm_relationships/.test(sql)) {
      return [{
        id: CHILD_ID,
        from_type: 'person', from_id: VISIBLE_ID,
        to_type: 'person', to_id: HIDDEN_ID,
        relationship_type: 'knows', is_decision_maker: false,
        is_primary_contact: false, notes: null
      }]
    }
    if (/FROM crm_people WHERE/.test(sql)) {
      return [{ id: HIDDEN_ID, first_name: 'Hidden', last_name: 'Person' }]
    }
    if (/crm_communications|crm_activities/.test(sql)) {
      return [{ id: CHILD_ID, title: 'Hidden communication', source: 'communication' }]
    }
    if (/crm_opportunity_line_items/.test(sql)) return [{ id: CHILD_ID, opportunity_id: HIDDEN_ID }]
    return []
  })
  mocks.queryOne.mockImplementation(async (sql: string) => {
    if (/INSERT INTO crm_communications/.test(sql)) return { id: CHILD_ID }
    if (/UPDATE crm_opportunity_line_items/.test(sql)) {
      return { id: CHILD_ID, client_id: CLIENT_ID, opportunity_id: HIDDEN_ID, description: 'Hidden' }
    }
    return null
  })
  mocks.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/^\s*SELECT (?:person|company|opportunity)\.\*/i.test(sql)) {
      return { rows: await mocks.queryRows(sql, params) }
    }
    if (/SELECT \* FROM crm_opportunity_line_items/.test(sql)) {
      return { rows: [{ id: CHILD_ID, client_id: CLIENT_ID, opportunity_id: HIDDEN_ID, description: 'Hidden' }] }
    }
    if (/INSERT INTO crm_communications/.test(sql)) return { rows: [{ id: CHILD_ID }] }
    if (/UPDATE crm_opportunity_line_items/.test(sql)) {
      return { rows: [{ id: CHILD_ID, client_id: CLIENT_ID, opportunity_id: HIDDEN_ID, description: 'Changed' }] }
    }
    return { rows: [] }
  })
  mocks.execute.mockResolvedValue(1)
})

describe('parent-inherited CRM child authorization', () => {
  it('does not list documents when their requested parent is hidden', async () => {
    await expect(listDocuments(ownerContext, 'person', HIDDEN_ID))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('does not return communication timeline entries for a hidden parent', async () => {
    await expect(listTimeline(ownerContext, 'person', HIDDEN_ID))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('requires every communication parent before inserting', async () => {
    await expect(createComm({
      context: ownerContext,
      clientId: CLIENT_ID,
      personId: VISIBLE_ID,
      companyId: HIDDEN_ID,
      channel: 'note',
      source: 'manual'
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.txQuery.mock.calls.some(([sql]) => /INSERT INTO crm_communications/.test(String(sql)))).toBe(false)
  })

  it('omits a relationship unless both endpoints remain visible', async () => {
    await expect(listRelationships(ownerContext, 'person', VISIBLE_ID)).resolves.toEqual([])
  })

  it('does not project the name of a soft-deleted relationship endpoint', async () => {
    mocks.queryRows.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/FROM crm_people person/.test(sql)) {
        const id = String(params[0])
        return [baseRecord(id)]
      }
      if (/FROM crm_relationships/.test(sql)) {
        return [{
          id: CHILD_ID,
          from_type: 'person', from_id: VISIBLE_ID,
          to_type: 'person', to_id: CHILD_ID,
          relationship_type: 'knows', is_decision_maker: false,
          is_primary_contact: false, notes: null
        }]
      }
      if (/FROM crm_people WHERE/.test(sql)) {
        return /deleted_at IS NULL/.test(sql)
          ? []
          : [{ id: CHILD_ID, first_name: 'Deleted', last_name: 'Person' }]
      }
      return []
    })

    await expect(listRelationships(ownerContext, 'person', VISIBLE_ID)).resolves.toEqual([
      expect.objectContaining({ other_id: CHILD_ID, other_name: 'Unknown' })
    ])
  })

  it('does not list line items for a hidden opportunity', async () => {
    await expect(listLineItems(ownerContext, HIDDEN_ID))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })

  it('authorizes a line item current opportunity before updating it', async () => {
    await expect(updateLineItem(ownerContext, CHILD_ID, { description: 'Changed' }))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(mocks.txQuery.mock.calls.some(([sql]) => /UPDATE crm_opportunity_line_items/.test(String(sql)))).toBe(false)
  })
})
