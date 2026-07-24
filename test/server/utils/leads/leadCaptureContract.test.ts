import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeDealerLeadWebhookBody } from '../../../../server/utils/leads/dealerLeadAdapter'
import { normalizeGooglePayload } from '../../../../server/utils/leads/normalizer'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '../../../../server/utils/leads/portalAnalytics'

const migration = readFileSync(
  new URL('../../../../server/database/migrations/288_client_lead_capture_mode.sql', import.meta.url),
  'utf8'
)
const reconciliationMigration = readFileSync(
  new URL('../../../../server/database/migrations/290_lead_submission_intent_reconciliation.sql', import.meta.url),
  'utf8'
)

describe('lead capture contract', () => {
  it('defines server-owned client modes and preserves existing CRM adopters', () => {
    expect(migration).toContain("'analytics_only', 'capture_only', 'lightweight_crm', 'full_crm', 'external_crm'")
    expect(migration).toContain("SET lead_capture_mode = 'full_crm'")
    expect(migration).toContain('FROM lead_crm_links')
  })

  it('extracts shared browser identity and campaign attribution from tracking fields', () => {
    const normalized = normalizeDealerLeadWebhookBody({
      key: 'secret',
      schema_version: 1,
      provider: 'dealer_studio',
      source: 'webhook',
      fields: {
        zeroflow_browser_event_id: 'browser-event-1',
        zeroflow_landing_page: 'https://dealer.example/cars?utm_source=google&utm_campaign=winter&gclid=click-1'
      },
      consent_decision: 'granted',
      is_test: false,
      promote_to_crm: true
    })

    expect(normalized.attribution).toMatchObject({
      browserEventId: 'browser-event-1',
      landing_page: expect.stringContaining('dealer.example'),
      utm_source: 'google',
      utm_campaign: 'winter',
      gclid: 'click-1'
    })
  })

  it('preserves first-touch and last-touch attribution independently', () => {
    const normalized = normalizeDealerLeadWebhookBody({
      key: 'secret',
      schema_version: 1,
      provider: 'dealer_studio',
      source: 'webhook',
      fields: {
        zeroflow_browser_event_id: 'browser-event-1',
        zeroflow_anon_id: 'anon-1',
        zeroflow_first_landing_page: 'https://dealer.example/?utm_source=google',
        zeroflow_first_utm_source: 'google',
        zeroflow_first_gclid: 'first-click',
        zeroflow_last_landing_page: 'https://dealer.example/vehicle?utm_source=email',
        zeroflow_last_utm_source: 'email'
      },
      consent_decision: 'granted',
      is_test: false,
      promote_to_crm: true
    })

    expect(normalized.attribution).toMatchObject({
      browserEventId: 'browser-event-1',
      anonId: 'anon-1',
      first_utm_source: 'google',
      first_gclid: 'first-click',
      last_utm_source: 'email',
      utm_source: 'email'
    })
  })

  it('keeps Google native lead-form identifiers without requiring a browser ID', () => {
    const normalized = normalizeGooglePayload({
      lead_id: 'google-lead-1',
      form_id: 'form-1',
      campaign_id: 'campaign-1',
      adgroup_id: 'ad-group-1',
      creative_id: 'creative-1',
      asset_group_id: 'asset-group-1',
      gcl_id: 'click-1',
      lead_source: 'LEAD_FORM',
      lead_submit_time: '2026-07-24T01:00:00Z',
      user_column_data: []
    }, '11111111-1111-4111-8111-111111111111')

    expect(normalized).toMatchObject({
      source: 'google',
      source_lead_id: 'google-lead-1',
      campaign_id: 'campaign-1',
      ad_id: 'creative-1',
      attribution: {
        provider: 'google_lead_form',
        gclid: 'click-1',
        ad_group_id: 'ad-group-1',
        creative_id: 'creative-1'
      }
    })
  })

  it('counts non-test leads when a client has no explicit portal routing rules', () => {
    expect(PORTAL_VISIBLE_LEADS_EXISTS).toContain('l.is_test = FALSE')
    expect(PORTAL_VISIBLE_LEADS_EXISTS).toContain('OR NOT EXISTS')
    expect(PORTAL_VISIBLE_LEADS_EXISTS).toContain("portal_destination.destination_type = 'portal'")
  })

  it('stores only fingerprints in the short-lived reconciliation table', () => {
    expect(reconciliationMigration).toContain('email_fingerprint')
    expect(reconciliationMigration).toContain('phone_fingerprint')
    expect(reconciliationMigration).toContain("INTERVAL '7 days'")
    expect(reconciliationMigration).not.toMatch(/\bemail\s+TEXT\b/i)
    expect(reconciliationMigration).not.toMatch(/\bphone\s+TEXT\b/i)
  })
})
