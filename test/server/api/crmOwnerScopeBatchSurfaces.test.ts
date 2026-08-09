import { describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { runBulk } from '~~/server/utils/crm/bulk'
import { findDedupeSuggestions, mergeContacts } from '~~/server/utils/crm/dedupe'
import { fetchExportRows } from '~~/server/utils/crm/exportRecords'
import { importPeopleCsv } from '~~/server/utils/crm/csv'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const VISIBLE_ID = '33333333-3333-4333-8333-333333333333'
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '55555555-5555-4555-8555-555555555555',
  clientId: CLIENT_ID,
  correlationId: '66666666-6666-4666-8666-666666666666',
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

describe('owner-scoped CRM batch surfaces', () => {
  it('rejects the entire bulk mutation before writing when one requested target is hidden', async () => {
    const tx = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/^\s*SELECT crm_people\.\*/i.test(sql)) {
          const id = params[0]
          return id === VISIBLE_ID
            ? { rows: [{ id, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }] }
            : { rows: [] }
        }
        if (/^\s*UPDATE/i.test(sql)) throw new Error('bulk mutation ran before complete authorization')
        return { rows: [] }
      })
    }

    await expect(runBulk(ownerContext, {
      entity: 'people',
      action: 'status',
      ids: [VISIBLE_ID, HIDDEN_ID],
      payload: { value: 'customer' }
    }, {
      transaction: async callback => await callback(tx)
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(tx.query.mock.calls.some(([sql]) => /^\s*UPDATE/i.test(String(sql)))).toBe(false)
  })

  it('forms no dedupe pair when only one side is visible to the actor', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      const visible = {
        id: VISIBLE_ID,
        first_name: 'Alex',
        last_name: 'Visible',
        email: 'same@example.com',
        phone: null,
        mobile: null
      }
      const hidden = {
        id: HIDDEN_ID,
        first_name: 'Alex',
        last_name: 'Hidden',
        email: 'same@example.com',
        phone: null,
        mobile: null
      }
      return /crm_people\.owner_id\s*=/.test(sql) ? [visible] : [visible, hidden]
    })

    await expect(findDedupeSuggestions(ownerContext, {
      entityType: 'person',
      limit: 50
    }, { queryRows })).resolves.toEqual([])
  })

  it('authorizes both dedupe merge sides before reassigning any children', async () => {
    const tx = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/^\s*SELECT crm_people\.\*/i.test(sql)) {
          const id = params[0]
          return id === VISIBLE_ID
            ? { rows: [{ id, client_id: CLIENT_ID, owner_id: ACTOR_ID, assigned_to: null }] }
            : { rows: [] }
        }
        if (/^\s*(?:UPDATE|DELETE|INSERT)/i.test(sql)) throw new Error('merge wrote before both records were authorized')
        return { rows: [] }
      })
    }

    await expect(mergeContacts({
      context: ownerContext,
      clientId: CLIENT_ID,
      entityType: 'person',
      winnerId: VISIBLE_ID,
      loserId: HIDDEN_ID,
      actor: ACTOR_ID
    }, {
      transaction: async callback => await callback(tx)
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(tx.query.mock.calls.some(([sql]) => /^\s*(?:UPDATE|DELETE|INSERT)/i.test(String(sql)))).toBe(false)
  })

  it('filters owner-scoped records before export projection', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      const visible = { first_name: 'Visible', email: 'visible@example.com' }
      const hidden = { first_name: 'Hidden', email: 'hidden@example.com' }
      return /crm_people\.owner_id\s*=/.test(sql) ? [visible] : [visible, hidden]
    })

    await expect(fetchExportRows('people', ownerContext, {}, { queryRows }))
      .resolves.toEqual([{ first_name: 'Visible', email: 'visible@example.com' }])
  })

  it('does not use a hidden duplicate as an import count oracle', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      return /crm_people\.owner_id\s*=/.test(sql) ? [] : [{ id: HIDDEN_ID }]
    })
    const queryOne = vi.fn(async () => ({ id: VISIBLE_ID }))

    const result = await importPeopleCsv(
      ownerContext,
      'first_name,email\nVisible,duplicate@example.com',
      { queryRows, queryOne }
    )

    expect(result).toEqual({ imported: 1, skipped: 0, errors: [] })
  })

  it('returns a generic import-row failure instead of database record details', async () => {
    const result = await importPeopleCsv(
      ownerContext,
      'first_name,email\nVisible,duplicate@example.com',
      {
        queryRows: async () => [],
        queryOne: async () => { throw new Error('duplicate key hidden@example.com') }
      }
    )

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      errors: [{ row: 2, message: 'insert_failed' }]
    })
  })
})
