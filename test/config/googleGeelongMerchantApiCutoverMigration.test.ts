import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/384_google_geelong_merchant_api_cutover.sql',
  import.meta.url
)

describe('Geelong GWM Haval New/Demo Merchant API cutover migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('binds the cutover to the exact active Xero client and guarded source', () => {
    const migration = sql()

    expect(migration).toContain('ef849136-7368-4650-bf89-853cbfa6a24a')
    expect(migration).toContain('Geelong GWM Haval')
    expect(migration).toContain('23c8c676-9e99-46d4-b66c-a4a9c87996da')
    expect(migration).toContain('da931735-9784-44fc-9a2a-d64738925fa4')
    expect(migration).toContain('source_key = \'google-merchant-api-new-demo\'')
    expect(migration).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT')
    expect(migration).toContain('IF v_updated <> 1')
  })

  it('records the exact drive-away price contract and enables only the API source', () => {
    const migration = sql()

    expect(migration).toContain('accounts/5727572526/dataSources/10707765487')
    expect(migration).toContain('\'{merchant,new_vehicle_price_source}\'')
    expect(migration).toContain('CATALOG_PRICE_DRIVE_AWAY')
    expect(migration).toContain('\'{merchant,auto_publish}\'')
    expect(migration).toContain('\'true\'::jsonb')
    expect(migration).toContain('connection_config #- \'{merchant,api_cutover_blocker}\'')
    expect(migration).not.toMatch(/access_token|refresh_token|client_secret/i)
  })
})
