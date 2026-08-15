import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/381_geelong_gwm_crm_enablement.sql',
  import.meta.url
)

describe('Geelong GWM Haval CRM enablement migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('targets only the exact active Xero-linked client', () => {
    const migration = sql()

    expect(migration).toContain('ef849136-7368-4650-bf89-853cbfa6a24a')
    expect(migration).toContain('Geelong GWM Haval')
    expect(migration).toContain('23c8c676-9e99-46d4-b66c-a4a9c87996da')
    expect(migration).toContain('lead_capture_mode IN (\'capture_only\', \'full_crm\')')
    expect(migration).toContain('IF v_updated <> 1')
  })

  it('enables internal CRM and records explicit core and external entitlements', () => {
    const migration = sql()

    expect(migration).toContain('lead_capture_mode = \'full_crm\'')
    expect(migration).toContain('\'crm.core\', \'active\'')
    expect(migration).toContain('\'crm.external\', \'suspended\'')
    expect(migration).toContain('ON CONFLICT (client_id, feature_key)')
    expect(migration).not.toMatch(/access_token|refresh_token|client_secret/i)
  })
})
