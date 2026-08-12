import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/crm/DataSources.client.vue', 'utf8')

describe('CRM Supabase catalog selection form', () => {
  it('captures seller, listing type, make and required completeness rules', () => {
    expect(source).toContain('seller_ids_text')
    expect(source).toContain('listing_types')
    expect(source).toContain('makes_text')
    expect(source).toContain('required_fields')
    expect(source).toContain('product_url_template')
    expect(source).toContain('sale_statuses: [\'For Sale\']')
  })

  it('captures explicit source column mappings without collecting credentials in config', () => {
    for (const field of [
      'source_product_id', 'stock_id', 'vin', 'seller_id', 'sale_status',
      'listing_type', 'merchant_offer_id', 'color'
    ]) expect(source).toContain(`${field}:`)
    expect(source).toContain('field_mapping:')
    expect(source).not.toMatch(/connection_config[\s\S]{0,200}api_key/)
  })

  it('uses Nuxt UI form controls and a container-aware field grid', () => {
    expect(source).toContain('<UFormField label="Seller IDs"')
    expect(source).toContain('<USelectMenu')
    expect(source).toContain('@container')
    expect(source).toContain('@lg:grid-cols-2')
    expect(source).not.toContain('<input')
    expect(source).not.toContain('<select')
  })
})
