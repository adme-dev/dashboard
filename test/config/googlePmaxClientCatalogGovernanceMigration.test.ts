import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'server/database/migrations/373_google_pmax_client_catalog_governance.sql',
  'utf8'
)

describe('Google PMax client catalog governance migration 373', () => {
  it('migrates both exact encrypted Supabase sources to governed selections', () => {
    expect(sql).toContain('95ab9bc4-119d-4671-abe4-0d7240f9eb52')
    expect(sql).toContain('b3d20525-d09b-4847-b29c-5ea16419b9d1')
    expect(sql).toContain('"sale_statuses": ["For Sale"]')
    expect(sql).toContain('"seller_ids"')
    expect(sql).toContain('"required_fields"')
  })

  it('makes Northern new Isuzu only and Brighton GWM new plus demo', () => {
    expect(sql).toContain('"makes": ["Isuzu"]')
    expect(sql).toContain('"listing_types": ["New"]')
    expect(sql).toContain('"makes": ["GWM"]')
    expect(sql).toContain('"listing_types": ["New", "Demo"]')
  })

  it('preserves valid landing pages and resolves the three known Northern colour gaps', () => {
    expect(sql).toContain('"product_url_template"')
    expect(sql).toContain('"B4298": "Red"')
    expect(sql).toContain('"35159S": "White"')
    expect(sql).toContain('"B4672X": "Beige"')
    expect(sql).toContain('"color": "exterior_colour_generic"')
    expect(sql).toContain('"color": "exterior_colour_name"')
  })

  it('links the exact Google Ads accounts to their XeroFlow client scopes', () => {
    expect(sql).toContain('06101987-52f5-4556-a93e-d27c5cb67fe3')
    expect(sql).toContain('090a3555-2018-4cbe-b16e-74798e45b5ec')
    expect(sql).toContain('efd1e1c6-f227-4b2f-b36d-19880bdba0e0')
    expect(sql).toContain('6e072410-8893-4ef8-a38c-3bb655e0eaa0')
  })

  it('fails closed if any expected source, account or Merchant identity differs', () => {
    expect(sql).toMatch(/GET DIAGNOSTICS[\s\S]*ROW_COUNT/)
    expect(sql).toMatch(/IF v_updated <> 1 THEN[\s\S]*RAISE EXCEPTION/g)
    expect(sql).toContain('connection_config #>> \'{merchant,account_id}\' = \'5507471616\'')
    expect(sql).toContain('connection_config #>> \'{merchant,account_id}\' = \'5817965641\'')
    expect(sql).toContain('account_id = \'9962002158\'')
    expect(sql).toContain('account_id = \'3437087580\'')
  })
})
