import { describe, expect, it, vi } from 'vitest'
import {
  createLeadStatusTransitionService
} from '../../../../server/utils/leads/statusTransition'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const TRANSITION_ID = '44444444-4444-4444-8444-444444444444'

function command() {
  return {
    clientId: CLIENT_ID,
    leadId: LEAD_ID,
    toStatus: 'qualified' as const,
    transitionId: TRANSITION_ID,
    actor: { type: 'team_member' as const, id: ACTOR_ID },
    occurredAt: '2026-07-26T01:00:00.000Z',
    consentDecision: 'granted' as const,
    reason: 'Qualified by sales',
    portalVisibleOnly: false
  }
}

function lead() {
  return {
    id: LEAD_ID,
    client_id: CLIENT_ID,
    status: 'contacted',
    source: 'google',
    source_lead_id: 'google-lead-1',
    attribution: { gclid: 'gclid-1' }
  }
}

describe('lead status transition service', () => {
  it('atomically records a mapped outcome and appends one canonical conversion', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM leads l/.test(sql)) return { rows: [lead()] }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ outcome_authority: 'zero_native', canonical_event_name: 'lead_qualified' }] }
        }
        if (/SELECT id[\s\S]*FROM lead_status_events/.test(sql)) return { rows: [] }
        if (/UPDATE leads/.test(sql)) return { rows: [{ id: LEAD_ID, status: 'qualified' }] }
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '55555555-5555-4555-8555-555555555555', outboxStatus: 'pending' },
      deliveryCount: 1
    }))
    const service = createLeadStatusTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    const result = await service.move(command())

    expect(result).toMatchObject({
      status: 'moved',
      canonicalEventName: 'lead_qualified',
      authorityDecision: 'accepted',
      outbox: { status: 'created', deliveryCount: 1 }
    })
    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      clientId: CLIENT_ID,
      eventName: 'lead_qualified',
      sourceSystem: 'zero_lead',
      sourceEntityType: 'lead',
      sourceEntityId: LEAD_ID,
      sourceEventId: `lead-status:${TRANSITION_ID}`,
      attribution: {
        browserEventId: null,
        metaLeadId: null,
        gclid: 'gclid-1',
        gbraid: null,
        wbraid: null,
        gaClientId: null
      }
    }))
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/FROM leads l/),
      expect.stringMatching(/measurement_lifecycle_mappings/),
      expect.stringMatching(/FROM lead_status_events/),
      expect.stringMatching(/UPDATE leads/),
      expect.stringMatching(/INSERT INTO lead_status_events/)
    ])
  })

  it('records but does not redeliver a duplicate canonical lead outcome', async () => {
    const inserts: Array<unknown[]> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/FROM leads l/.test(sql)) return { rows: [lead()] }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ outcome_authority: 'zero_native', canonical_event_name: 'lead_qualified' }] }
        }
        if (/SELECT id[\s\S]*FROM lead_status_events/.test(sql)) return { rows: [{ id: 'existing' }] }
        if (/UPDATE leads/.test(sql)) return { rows: [{ id: LEAD_ID, status: 'qualified' }] }
        if (/INSERT INTO lead_status_events/.test(sql)) inserts.push(params)
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn()
    const service = createLeadStatusTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    const result = await service.move(command())

    expect(result).toMatchObject({
      status: 'moved',
      canonicalEventName: 'lead_qualified',
      authorityDecision: 'duplicate',
      outbox: null
    })
    expect(inserts[0]?.[6]).toBe('duplicate')
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('applies the portal visibility predicate before locking the lead', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] }))
    }
    const service = createLeadStatusTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: vi.fn() as never
    })

    const result = await service.move({ ...command(), portalVisibleOnly: true })

    expect(result).toEqual({ status: 'lead_not_found' })
    expect(String(db.query.mock.calls[0]?.[0])).toContain('destination_type = \'portal\'')
  })
})
