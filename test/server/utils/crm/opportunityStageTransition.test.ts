import { describe, expect, it, vi } from 'vitest'
import {
  createOpportunityStageTransitionService
} from '../../../../server/utils/crm/opportunityStageTransition'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '22222222-2222-4222-8222-222222222222'
const FROM_STAGE_ID = '33333333-3333-4333-8333-333333333333'
const TO_STAGE_ID = '44444444-4444-4444-8444-444444444444'
const HISTORY_ID = '55555555-5555-4555-8555-555555555555'
const LEAD_ID = '66666666-6666-4666-8666-666666666666'
const ACTOR_ID = '77777777-7777-4777-8777-777777777777'

function command() {
  return {
    clientId: CLIENT_ID,
    opportunityId: OPPORTUNITY_ID,
    toStageId: TO_STAGE_ID,
    expectedStageId: FROM_STAGE_ID,
    actor: { type: 'team_member' as const, id: ACTOR_ID },
    occurredAt: '2026-07-17T05:00:00.000Z',
    consentDecision: 'granted' as const,
    reason: 'Qualified after sales review'
  }
}

function stage() {
  return {
    id: TO_STAGE_ID,
    code: 'qualified',
    probability: 25,
    is_won: false,
    is_lost: false
  }
}

function opportunity() {
  return {
    id: OPPORTUNITY_ID,
    client_id: CLIENT_ID,
    stage_id: FROM_STAGE_ID,
    stage_code: 'new',
    owner_id: null,
    status: 'open'
  }
}

describe('opportunity stage transition service', () => {
  it('atomically moves a mapped stage, records lifecycle evidence, mirrors the linked lead and appends one outbox event', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FROM crm_opportunities[\s\S]*FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID }] }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ canonical_event_name: 'lead_qualified' }] }
        }
        if (/FROM lead_crm_links/.test(sql)) {
          return { rows: [{
            lead_id: LEAD_ID,
            source: 'meta',
            source_lead_id: '1234567890123456',
            attribution: {
              browserEventId: 'browser-event-1',
              gclid: 'gclid-1',
              ttclid: 'tiktok-click-1',
              ttp: 'tiktok-browser-1',
              eventSourceUrl: 'https://rebtyota.com.au/enquiry/?lead=private'
            }
          }] }
        }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '88888888-8888-4888-8888-888888888888', outboxStatus: 'pending' },
      deliveryCount: 1
    }))
    const service = createOpportunityStageTransitionService({
      transaction: transaction as never,
      appendOutbox: appendOutbox as never
    })

    const result = await service.move(command())

    expect(result).toMatchObject({
      status: 'moved',
      historyId: HISTORY_ID,
      canonicalEventName: 'lead_qualified',
      linkedLeadId: LEAD_ID,
      outbox: { status: 'created', deliveryCount: 1 }
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      clientId: CLIENT_ID,
      eventName: 'lead_qualified',
      sourceSystem: 'zero_crm',
      sourceEntityType: 'crm_opportunity',
      sourceEntityId: OPPORTUNITY_ID,
      sourceEventId: `crm-stage-history:${HISTORY_ID}`,
      attribution: {
        browserEventId: null,
        metaLeadId: '1234567890123456',
        gclid: 'gclid-1',
        gbraid: null,
        wbraid: null,
        fbc: null,
        fbp: null,
        ttclid: 'tiktok-click-1',
        ttp: 'tiktok-browser-1',
        gaClientId: null,
        eventSourceUrl: 'https://rebtyota.com.au/enquiry/',
        clientUserAgent: null
      }
    }))
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/FROM crm_stages/),
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/UPDATE crm_opportunities/),
      expect.stringMatching(/INSERT INTO crm_opportunity_stage_history/),
      expect.stringMatching(/measurement_lifecycle_mappings/),
      expect.stringMatching(/FROM lead_crm_links/),
      expect.stringMatching(/INSERT INTO lead_status_events/),
      expect.stringMatching(/UPDATE leads/)
    ])
    expect(statements[3]?.params).toEqual([
      CLIENT_ID,
      OPPORTUNITY_ID,
      FROM_STAGE_ID,
      TO_STAGE_ID,
      ACTOR_ID,
      command().occurredAt
    ])
  })

  it('moves an unmapped stage without manufacturing a canonical outcome', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID }] }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn()
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    const result = await service.move(command())

    expect(result).toMatchObject({
      status: 'moved',
      canonicalEventName: null,
      linkedLeadId: null,
      outbox: null
    })
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('rejects a stale expected stage before any mutation', async () => {
    const writes: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FOR UPDATE/.test(sql)) return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID }] }
        writes.push(sql)
        return { rows: [] }
      })
    }
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: vi.fn() as never
    })

    const result = await service.move(command())

    expect(result).toEqual({ status: 'stage_conflict', currentStageId: TO_STAGE_ID })
    expect(writes).toEqual([])
  })

  it('treats an exact retry as a no-op and does not append a second history event', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FOR UPDATE/.test(sql)) return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID }] }
        return { rows: [] }
      })
    }
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: vi.fn() as never
    })

    const result = await service.move({ ...command(), expectedStageId: TO_STAGE_ID })

    expect(result).toEqual({ status: 'no_change', currentStageId: TO_STAGE_ID })
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('propagates an outbox failure so the surrounding lifecycle transaction rolls back', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID }] }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ canonical_event_name: 'lead_qualified' }] }
        }
        if (/FROM lead_crm_links/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
    const service = createOpportunityStageTransitionService({
      transaction: transaction as never,
      appendOutbox: vi.fn(async () => { throw new Error('outbox unavailable') }) as never
    })

    await expect(service.move(command())).rejects.toThrow('outbox unavailable')
    expect(transaction).toHaveBeenCalledOnce()
  })
})
