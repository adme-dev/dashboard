import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/379_google_geelong_merchant_api_catalog.sql',
  import.meta.url
)

describe('Geelong GWM Haval Merchant API catalog migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('binds two exact governed sources to the Xero client and active Google identities', () => {
    const migration = sql()

    expect(migration).toContain('ef849136-7368-4650-bf89-853cbfa6a24a')
    expect(migration).toContain('Geelong GWM Haval')
    expect(migration).toContain('23c8c676-9e99-46d4-b66c-a4a9c87996da')
    expect(migration).toContain('87d6e44f-e6a0-47d1-9a32-27ade143b538')
    expect(migration).toContain('7979828031')
    expect(migration).toContain('5727572526')
    expect(migration).toContain('906883f9-8cf3-4cfa-a98e-a044b703bf8c')
    expect(migration).toContain('551257489')
    expect(migration.match(/INSERT INTO crm_catalog_sources/g)).toHaveLength(2)
  })

  it('preserves the exact working New/Demo and Used upstream scopes', () => {
    const migration = sql()

    expect(migration).toContain('vehicle-inventory-system.adme-dev.workers.dev/api/feed/carsales?dealer_id=STORE08')
    expect(migration).toContain('tsheefvkecaervnrxvdf.supabase.co')
    expect(migration).toContain('d00498d9-f077-780f-5be5-8d0956ce0458')
    expect(migration).toContain('"listing_types": ["New", "Demo"]')
    expect(migration).toContain('"listing_types": ["Used"]')
    expect(migration).toContain('"excluded_source_product_ids": ["217394", "217401"]')
  })

  it('starts from the two exact FILE sources and creates distinct API source identities', () => {
    const migration = sql()

    expect(migration).toContain('accounts/5727572526/dataSources/10615475689')
    expect(migration).toContain('accounts/5727572526/dataSources/10706366787')
    expect(migration).toContain('XeroFlow Vehicle Inventory · Geelong GWM Haval · New & Demo')
    expect(migration).toContain('XeroFlow Vehicle Inventory · Geelong GWM Haval · Used')
    expect(migration.match(/"auto_publish": true/g)).toHaveLength(2)
    expect(migration.match(/connection_config = jsonb_set\(/g)).toHaveLength(2)
    expect(migration.match(/\^accounts\/5727572526\/dataSources\/\[0-9\]\+\$/g)).toHaveLength(2)
    expect(migration).not.toMatch(/SUPABASE_VEHICLES_KEY|access_token|refresh_token/i)
  })
})
