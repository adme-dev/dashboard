import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/380_google_geelong_new_vehicle_price_guard.sql',
  import.meta.url
)

describe('Geelong GWM Haval New/Demo Merchant price guard migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('binds the rollback only to the exact active Xero client and governed source', () => {
    const migration = sql()

    expect(migration).toContain('ef849136-7368-4650-bf89-853cbfa6a24a')
    expect(migration).toContain('Geelong GWM Haval')
    expect(migration).toContain('23c8c676-9e99-46d4-b66c-a4a9c87996da')
    expect(migration).toContain('da931735-9784-44fc-9a2a-d64738925fa4')
    expect(migration).toContain('source_key = \'google-merchant-api-new-demo\'')
    expect(migration).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT')
    expect(migration).toContain('IF v_updated <> 1')
  })

  it('restores the working FILE identity and disables API publication fail closed', () => {
    const migration = sql()

    expect(migration).toContain('accounts/5727572526/dataSources/10615475689')
    expect(migration).toContain('accounts/5727572526/dataSources/10707765487')
    expect(migration).toContain('\'{merchant,auto_publish}\'')
    expect(migration).toContain('\'false\'::jsonb')
    expect(migration).toContain('NEW_VEHICLE_DRIVE_AWAY_PRICE_REQUIRED')
    expect(migration).not.toMatch(/access_token|refresh_token|client_secret/i)
  })
})
