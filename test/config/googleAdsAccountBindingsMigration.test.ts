import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/405_northern_gac_measurement_accounts.sql', import.meta.url),
  'utf8'
)

describe('Northern GAC measurement-account migration', () => {
  it('creates client and alias bound Google account roles without credential columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_ads_account_bindings')
    expect(migration).toContain('\'dealer\', \'brand\', \'group\', \'reporting_only\', \'default_measurement\'')
    expect(migration).toContain('FOREIGN KEY (client_id, alias_id)')
    expect(migration).toContain('REFERENCES agency_client_aliases(client_id, id)')
    expect(migration).toContain('FOREIGN KEY (client_id, connection_id)')
    expect(migration).toContain('REFERENCES social_connections(client_id, id)')
    expect(migration).not.toMatch(/access_token|refresh_token|developer_token|client_secret/i)
  })

  it('fails closed unless the exact pilot client, aliases, connections, and customer IDs exist', () => {
    expect(migration).toContain('\'efd1e1c6-f227-4b2f-b36d-19880bdba0e0\'::uuid')
    expect(migration).toContain('\'717f209a-b2ea-4f2e-b489-2034a16ae9c1\'::uuid')
    expect(migration).toContain('\'9e32b563-a2c7-4e44-b703-1223260abd4b\'::uuid')
    expect(migration).toContain('\'7583977544\'')
    expect(migration).toContain('\'6692975433\'')
    expect(migration).toMatch(/IF pilot_issue IS NOT NULL THEN[\s\S]*RAISE EXCEPTION/)
  })

  it('binds the dealer alias directly and the canonical client to the group account idempotently', () => {
    expect(migration).toMatch(/Northern GAC[\s\S]*717f209a-b2ea-4f2e-b489-2034a16ae9c1[\s\S]*7583977544[\s\S]*dealer/)
    expect(migration).toMatch(/Northern Motor Group[\s\S]*9e32b563-a2c7-4e44-b703-1223260abd4b[\s\S]*6692975433[\s\S]*group/)
    expect(migration).toContain('ON CONFLICT (client_id, connection_id) DO UPDATE')
  })
})
