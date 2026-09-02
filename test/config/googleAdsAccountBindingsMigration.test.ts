import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/405_google_ads_measurement_account_bindings.sql', import.meta.url),
  'utf8'
)

describe('Google Ads measurement-account schema migration', () => {
  it('creates client and alias bound Google account roles without credential columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_ads_account_bindings')
    expect(migration).toContain('\'dealer\', \'brand\', \'group\', \'reporting_only\', \'default_measurement\'')
    expect(migration).toContain('FOREIGN KEY (client_id, alias_id)')
    expect(migration).toContain('REFERENCES agency_client_aliases(client_id, id)')
    expect(migration).toContain('FOREIGN KEY (client_id, connection_id)')
    expect(migration).toContain('REFERENCES social_connections(client_id, id)')
    expect(migration).not.toMatch(/access_token|refresh_token|developer_token|client_secret/i)
  })

  it('contains no client-specific binding mutation', () => {
    expect(migration).not.toMatch(/INSERT INTO google_ads_account_bindings/)
    expect(migration).not.toMatch(/Northern GAC|Northern Motor Group|Knox LDV/)
  })
})
