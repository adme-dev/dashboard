import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../../server/database/migrations/372_google_pmax_deployment_contracts.sql', import.meta.url),
  'utf8'
)

describe('Google PMax deployment contract migration 372', () => {
  it('persists exact tenant, client, source, Merchant, Ads and measurement identities', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS google_pmax_deployment_contracts/i)
    for (const column of [
      'tenant_id', 'client_id', 'source_connector_id', 'merchant_account_id',
      'merchant_data_source_id', 'ads_connection_id', 'ads_customer_id',
      'ads_campaign_id', 'tracking_site_id', 'contract_version', 'contract_hash',
      'normalized_contract'
    ]) expect(sql).toContain(column)
  })

  it('prevents one live Google campaign from being claimed by multiple contracts', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*tenant_id, ads_customer_id, ads_campaign_id[\s\S]*WHERE state IN \('VERIFIED', 'ACTIVE'\)/i)
  })

  it('checks indexed identities against the normalized contract JSON', () => {
    expect(sql).toContain('normalized_contract ->> \'clientId\' = client_id::text')
    expect(sql).toContain('normalized_contract #>> \'{source,connectorId}\' = source_connector_id::text')
    expect(sql).toContain('normalized_contract #>> \'{merchant,accountId}\' = merchant_account_id')
    expect(sql).toContain('normalized_contract #>> \'{merchant,dataSourceId}\' = merchant_data_source_id')
    expect(sql).toContain('normalized_contract #>> \'{ads,connectionId}\' = ads_connection_id::text')
    expect(sql).toContain('normalized_contract #>> \'{ads,customerId}\' = ads_customer_id')
    expect(sql).toContain('normalized_contract #>> \'{ads,campaignId}\' = ads_campaign_id')
    expect(sql).toContain('normalized_contract #>> \'{measurement,trackingSiteId}\' = tracking_site_id::text')
  })

  it('keeps credentials out and identity evidence immutable', () => {
    expect(sql).toMatch(/NOT campaign_launch_payload_has_sensitive_keys\(normalized_contract\)/i)
    expect(sql).toMatch(/prevent_google_pmax_deployment_contract_identity_mutation/i)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON google_pmax_deployment_contracts/i)
  })

  it('is transactional and additive', () => {
    expect(sql.trimStart()).toMatch(/^-- 372_google_pmax_deployment_contracts\.sql/)
    expect(sql).toMatch(/\bBEGIN;/)
    expect(sql).toMatch(/\bCOMMIT;/)
    expect(sql).not.toMatch(/DROP TABLE/i)
  })
})
