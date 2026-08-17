import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/385_google_brighton_merchant_credential_binding.sql',
  import.meta.url
)
const placeholderExclusionPath = new URL(
  '../../server/database/migrations/386_google_brighton_placeholder_vehicle_exclusion.sql',
  import.meta.url
)

describe('Brighton GWM agency Merchant credential binding migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('binds only the exact active Xero client, source, Ads account, and Merchant account', () => {
    const migration = sql()

    expect(migration).toContain('6e072410-8893-4ef8-a38c-3bb655e0eaa0')
    expect(migration).toContain('Brighton Auto Group')
    expect(migration).toContain('95ab9bc4-119d-4671-abe4-0d7240f9eb52')
    expect(migration).toContain('supabase-brighton-gwm')
    expect(migration).toContain('090a3555-2018-4cbe-b16e-74798e45b5ec')
    expect(migration).toContain('3437087580')
    expect(migration).toContain('5817965641')
    expect(migration).toContain('accounts/5817965641/dataSources/10705708313')
    expect(migration).toContain('accounts/5817965641/dataSources/10707976745')
    expect(migration).toContain('{merchant,legacy_data_source}')
    expect(migration).toContain('XeroFlow Vehicle Inventory · Brighton GWM')
    expect(migration).toContain('last_item_count IN (312, 313)')
    expect(migration).not.toContain('last_item_count = 313')
  })

  it('extends only the verified agency Merchant profile and stamps it onto the source', () => {
    const migration = sql()

    expect(migration).toContain('906883f9-8cf3-4cfa-a98e-a044b703bf8c')
    expect(migration).toContain('551257489')
    expect(migration).toContain('advertising@adme.net.au')
    expect(migration).toContain('https://www.googleapis.com/auth/content')
    expect(migration).toContain('{merchant,credential_profile_id}')
    expect(migration).toContain('{merchant,registration_account_id}')
    expect(migration).toContain('GET DIAGNOSTICS v_profile_updated = ROW_COUNT')
    expect(migration).toContain('GET DIAGNOSTICS v_source_updated = ROW_COUNT')
    expect(migration).not.toMatch(/access_token|refresh_token|client_secret/i)
  })

  it('excludes only the provider-disapproved placeholder-image vehicle', () => {
    const migration = readFileSync(placeholderExclusionPath, 'utf8')

    expect(migration).toContain('95ab9bc4-119d-4671-abe4-0d7240f9eb52')
    expect(migration).toContain('0d55fdf9-f0a1-45a9-be43-55813c4a6fbc')
    expect(migration).toContain('XF-H987447')
    expect(migration).toContain('99w6bokrqq6zrq38mjvb20bdf.jpg')
    expect(migration).toContain('{selection,excluded_source_product_ids}')
    expect(migration).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT')
    expect(migration).toContain('IF v_updated <> 1')
    expect(migration).not.toContain('AND product.deleted_at IS NULL')
  })
})
