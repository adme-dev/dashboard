import { describe, expect, it, vi } from 'vitest'
import {
  resolveTrustedCrmSystemContext,
  type CrmSearchContext
} from '~~/server/utils/crm/searchContext'
import { filterAuthorizedMeetingCandidates } from '~~/server/utils/crm/meetingBridge'
import { createQuoteFromOpportunity } from '~~/server/utils/crm/oppQuote'
import { claimTrustedReminderTasks } from '~~/server/utils/crm/activation'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { authorizeRecordRelations } from '~~/server/utils/crm/engine/recordWrite'
import { requireAssignmentPoolMembers } from '~~/server/utils/crm/assignment'

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

describe('owner-scoped indirect CRM paths', () => {
  it('reloads the active client before granting an explicit trusted-system scope', async () => {
    const loadOrganisationScope = vi.fn(async () => ownerContext.organisationScopeId)
    const deps = {
      loadClient: vi.fn(async () => null),
      loadOrganisationScope,
      createCorrelationId: vi.fn(() => ownerContext.correlationId)
    }

    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'crm_task_reminders'
    }, deps)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })

    expect(deps.loadClient).toHaveBeenCalledWith(CLIENT_ID)
    expect(loadOrganisationScope).not.toHaveBeenCalled()
  })

  it('reauthorizes every reminder task before the internal batch write', async () => {
    let authorized = false
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (/UPDATE crm_tasks/.test(sql) && !authorized) throw new Error('reminder write ran before authorization')
        return { rows: [{ id: VISIBLE_ID, client_id: CLIENT_ID, reminded_at: '2026-08-10T00:00:00.000Z' }] }
      })
    }
    const task = {
      id: VISIBLE_ID,
      client_id: CLIENT_ID,
      title: 'Follow up',
      assigned_to: ACTOR_ID,
      reminder_at: '2026-08-09T00:00:00.000Z',
      due_at: null
    }

    const claimed = await claimTrustedReminderTasks({
      tasks: [task],
      remindedAt: new Date('2026-08-10T00:00:00.000Z'),
      purpose: 'crm_task_reminders'
    }, {
      resolveContext: async () => ({
        ...ownerContext,
        actorType: 'system',
        actorId: 'trusted-system:crm_task_reminders',
        surface: 'trusted_system',
        permissionSet: [],
        visibility: { ownerScoped: false },
        trustedSystem: { purpose: 'crm_task_reminders' }
      }),
      transaction: async callback => await callback(tx),
      authorizeAll: async (_context, refs, client) => {
        expect(refs).toEqual([{ type: 'task', id: VISIBLE_ID }])
        expect(client).toBe(tx)
        authorized = true
        return [{ type: 'task', id: VISIBLE_ID, clientId: CLIENT_ID, row: { id: VISIBLE_ID } }]
      }
    })

    expect(claimed).toEqual([expect.objectContaining({ id: VISIBLE_ID, client_id: CLIENT_ID })])
    expect(tx.query).toHaveBeenCalledTimes(1)
  })

  it('filters custom records through protected relation fields before projection', () => {
    const filter = buildRecordFilter(CLIENT_ID, 'object-1', {
      context: ownerContext,
      relationFields: [{ key: 'customer', target: 'person' }]
    })

    expect(filter.where).toMatch(/EXISTS[\s\S]*FROM crm_people/)
    expect(filter.where).toMatch(/owner_id/)
    expect(filter.params).toEqual(expect.arrayContaining([ACTOR_ID]))
  })

  it('authorizes every custom relation value inside its mutation transaction', async () => {
    const tx = { query: vi.fn() }
    const authorizeAll = vi.fn(async () => [{
      type: 'person', id: VISIBLE_ID, clientId: CLIENT_ID, row: { id: VISIBLE_ID }
    }])
    const defs = [{
      key: 'customer',
      field_type: 'relation',
      relation_target: 'person',
      options: [],
      is_required: false
    }]

    await authorizeRecordRelations(
      ownerContext,
      defs as never,
      { customer: VISIBLE_ID },
      tx,
      { authorizeAll }
    )

    expect(authorizeAll).toHaveBeenCalledWith(
      ownerContext,
      [{ type: 'person', id: VISIBLE_ID }],
      tx
    )
  })

  it('fails closed when a custom relation field has no protected target', async () => {
    const malformedDefs = [{
      key: 'customer',
      field_type: 'relation',
      relation_target: null,
      options: [],
      is_required: false
    }]
    const authorizeAll = vi.fn()

    expect(() => buildRecordFilter(CLIENT_ID, 'object-1', {
      context: ownerContext,
      relationFields: [{ key: 'customer', target: null } as never]
    })).toThrow('no protected target')
    await expect(authorizeRecordRelations(
      ownerContext,
      malformedDefs as never,
      { customer: HIDDEN_ID },
      undefined,
      { authorizeAll }
    )).rejects.toThrow('no protected target')
    expect(authorizeAll).not.toHaveBeenCalled()
  })

  it('preauthorizes the complete assignment pool before a rule write', async () => {
    const tx = {
      query: vi.fn(async () => ({ rows: [{ id: ACTOR_ID }] }))
    }
    await expect(requireAssignmentPoolMembers(
      CLIENT_ID,
      [ACTOR_ID, HIDDEN_ID],
      tx
    )).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringMatching(/client_team_assignments/),
      [CLIENT_ID, [ACTOR_ID, HIDDEN_ID]]
    )
  })

  it('locks valid assignment-pool members with PostgreSQL-compatible SQL', async () => {
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT\s+DISTINCT[\s\S]*FOR SHARE/i.test(sql)) {
          throw new Error('FOR SHARE is not allowed with DISTINCT clause')
        }
        return { rows: [{ id: ACTOR_ID }, { id: ACTOR_ID }] }
      })
    }

    await expect(requireAssignmentPoolMembers(
      CLIENT_ID,
      [ACTOR_ID],
      tx
    )).resolves.toEqual([{ id: ACTOR_ID }, { id: ACTOR_ID }])
  })

  it('authorizes every meeting match and disambiguation option before returning proposals', async () => {
    const filtered = await filterAuthorizedMeetingCandidates({
      candidatePeople: [
        { person_id: VISIBLE_ID, client_id: CLIENT_ID, company_id: null, company_name: null, email: 'visible@example.com', display_name: 'Visible' },
        { person_id: HIDDEN_ID, client_id: CLIENT_ID, company_id: null, company_name: null, email: 'hidden@example.com', display_name: 'Hidden' }
      ],
      candidateOpps: [
        { opportunity_id: HIDDEN_ID, client_id: CLIENT_ID, person_id: VISIBLE_ID, company_id: null, name: 'Hidden deal', updated_at: '2026-08-01T00:00:00.000Z' }
      ]
    }, async ref => ref.id === VISIBLE_ID)

    expect(filtered).toEqual({
      candidatePeople: [expect.objectContaining({ person_id: VISIBLE_ID, display_name: 'Visible' })],
      candidateOpps: []
    })
  })

  it('reauthorizes the opportunity inside the quote mutation transaction', async () => {
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT opportunity\.\*/.test(sql)) return { rows: [] }
        if (/^\s*INSERT|^\s*UPDATE/.test(sql)) throw new Error('quote write ran before authorization')
        return { rows: [] }
      })
    }

    await expect(createQuoteFromOpportunity({
      context: ownerContext,
      opportunityId: HIDDEN_ID,
      clientId: CLIENT_ID,
      opp: { name: 'Hidden deal' },
      items: [{ name: 'Service', quantity: 1, unitPrice: 100, lineTotal: 100, sortOrder: 0 }],
      userId: ACTOR_ID
    }, {
      transaction: async callback => await callback(tx),
      queryOne: async () => null
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })

    expect(tx.query.mock.calls.some(([sql]) => /^\s*(?:INSERT|UPDATE)/.test(String(sql)))).toBe(false)
  })
})
