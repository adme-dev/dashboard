import { describe, expect, it, vi } from 'vitest'
import {
  appendConfirmedBrowserLeadEvent,
  appendConfirmedBrowserLeadEventForStoredFormSubmission,
  reconcileConfirmedBrowserLeadEvents
} from '../../../../server/utils/leads/browserConfirmation'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const BROWSER_EVENT_ID = 'provider-submission-1'

describe('browser lead confirmation', () => {
  it('reconciles a CRM lead when its browser form event arrives later', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
        if (sql.includes('JOIN leads confirmed_lead')) {
          return { rows: [{ event_id: `confirmed-lead:${LEAD_ID}` }] }
        }
        return { rows: [] }
      })
    }

    const confirmedDuringLeadIntake = await appendConfirmedBrowserLeadEvent(db, {
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
      browserEventId: BROWSER_EVENT_ID,
      source: 'webhook',
      occurredAt: '2026-07-28T08:00:00.000Z'
    })
    const confirmedWhenBrowserEventArrived = await appendConfirmedBrowserLeadEventForStoredFormSubmission(db, {
      clientId: CLIENT_ID,
      browserEventId: BROWSER_EVENT_ID
    })

    expect(confirmedDuringLeadIntake).toBe(false)
    expect(confirmedWhenBrowserEventArrived).toBe(true)
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`${CLIENT_ID}:${BROWSER_EVENT_ID}`]
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("confirmed_lead.attribution->>'browserEventId'"),
      [CLIENT_ID, BROWSER_EVENT_ID]
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("source_event.event_data->>'capture_source' = 'explicit_provider_bridge'"),
      [CLIENT_ID, BROWSER_EVENT_ID]
    )
  })

  it('reports repaired confirmations during the scheduled recovery sweep', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          { event_id: `confirmed-lead:${LEAD_ID}` },
          { event_id: 'confirmed-lead:33333333-3333-4333-8333-333333333333' }
        ]
      }))
    }

    await expect(reconcileConfirmedBrowserLeadEvents(db)).resolves.toBe(2)
  })
})
