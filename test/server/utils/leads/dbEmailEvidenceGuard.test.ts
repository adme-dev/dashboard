import { describe, expect, it, vi } from 'vitest'
import { insertLeadWithDedup } from '../../../../server/utils/leads/db'

const INGESTION_ID = '33333333-3333-4333-8333-333333333333'
const LEASE_TOKEN = '44444444-4444-4444-8444-444444444444'

describe('guarded email lead insertion', () => {
  it('returns evidence_expired from the atomic INSERT fence when no lead is inserted', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: null, outcome: 'evidence_expired' }]
    }))

    await expect(insertLeadWithDedup({
      client_id: '11111111-1111-4111-8111-111111111111',
      source: 'webhook',
      source_lead_id: 'email:guarded-lead',
      form_id: 'email_endpoint:test',
      form_name: 'Email',
      ad_id: null,
      ad_name: null,
      campaign_id: null,
      campaign_name: null,
      page_id: null,
      submitted_at: '2026-07-29T00:00:00.000Z',
      field_data: { email: 'customer@example.test' },
      attribution: null,
      assigned_to: null,
      created_by: null
    }, { query }, {
      ingestionId: INGESTION_ID,
      leaseToken: LEASE_TOKEN
    })).resolves.toEqual({ status: 'evidence_expired' })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(
      /SELECT EXISTS[\s\S]*INSERT INTO leads[\s\S]*SELECT[\s\S]*FROM evidence_guard[\s\S]*WHERE valid/
    )
    expect(sql).toMatch(
      /lead_email_ingestions[\s\S]*recovery_lease_token = \$18::uuid[\s\S]*staged_expires_at > clock_timestamp\(\)/
    )
    expect(params).toEqual(expect.arrayContaining([INGESTION_ID, LEASE_TOKEN]))
  })
})
