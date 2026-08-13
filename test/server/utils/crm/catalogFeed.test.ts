import { describe, expect, it } from 'vitest'
import {
  applySupabaseCatalogSelection,
  buildSupabaseCatalogPageUrl,
  keepUnambiguousProductIdentifiers,
  catalogSelectionCanRetireAll,
  CatalogFeedError,
  normalizeCatalogItems,
  normalizeSupabaseCatalogSelection,
  parseCatalogFeed,
  selectSupabaseCatalogRowsForSource,
  selectSupabaseCatalogRowsWithDiagnostics,
  validateCatalogFeedUrl
} from '../../../../server/utils/crm/catalogFeed'

describe('Supabase catalog selection', () => {
  const selection = normalizeSupabaseCatalogSelection({
    seller_ids: ['northern-isuzu-ute'],
    sale_statuses: ['For Sale'],
    makes: ['Isuzu'],
    listing_types: ['New', 'Demo'],
    required_fields: ['source_product_id', 'stock_id', 'vin', 'price', 'product_url', 'primary_image_url', 'color']
  })

  it('includes only exact seller, For Sale, make and listing-type matches', () => {
    const result = applySupabaseCatalogSelection([
      {
        id: 'new-1', seller_id: 'northern-isuzu-ute', sale_status: 'For Sale',
        make: 'Isuzu', listing_type: 'New', stock_number: 'N1', vin: 'VIN1',
        price: 50000, url: 'https://example.com/n1', image_url: 'https://example.com/n1.jpg', color: 'White'
      },
      {
        id: 'sold-1', seller_id: 'northern-isuzu-ute', sale_status: 'SOLD',
        make: 'Isuzu', listing_type: 'New', stock_number: 'S1', vin: 'VIN2',
        price: 50000, url: 'https://example.com/s1', image_url: 'https://example.com/s1.jpg', color: 'Black'
      },
      {
        id: 'other-seller', seller_id: 'brighton-gwm', sale_status: 'For Sale',
        make: 'Isuzu', listing_type: 'Demo', stock_number: 'O1', vin: 'VIN3',
        price: 50000, url: 'https://example.com/o1', image_url: 'https://example.com/o1.jpg', color: 'Blue'
      }
    ], selection)

    expect(result.included.map(row => row.id)).toEqual(['new-1'])
    expect(result.excluded.map(item => item.reason)).toEqual(['SALE_STATUS_NOT_SELECTED', 'SELLER_NOT_SELECTED'])
  })

  it('keeps Demo distinct and rejects missing Merchant completeness fields', () => {
    const result = applySupabaseCatalogSelection([
      {
        id: 'demo-1', seller_id: 'northern-isuzu-ute', sale_status: 'For Sale',
        make: 'Isuzu', listing_type: 'Demo', stock_number: 'D1', vin: 'VIN4',
        price: 45000, url: 'https://example.com/d1', image_url: 'https://example.com/d1.jpg', color: 'Grey'
      },
      {
        id: 'missing-color', seller_id: 'northern-isuzu-ute', sale_status: 'For Sale',
        make: 'Isuzu', listing_type: 'New', stock_number: 'N2', vin: 'VIN5',
        price: 55000, url: 'https://example.com/n2', image_url: 'https://example.com/n2.jpg'
      }
    ], selection)

    expect(result.included).toHaveLength(1)
    expect(result.included[0]?.listing_type).toBe('Demo')
    expect(result.excluded).toEqual([
      expect.objectContaining({ sourceProductId: 'missing-color', reason: 'REQUIRED_FIELD_MISSING', field: 'color' })
    ])
  })

  it('applies an explicit stock colour override before completeness filtering', () => {
    const selection = normalizeSupabaseCatalogSelection({
      seller_ids: ['northern-isuzu'],
      sale_statuses: ['For Sale'],
      makes: ['Isuzu'],
      listing_types: ['New'],
      required_fields: ['source_product_id', 'stock_id', 'vin', 'color'],
      color_overrides: { B4298: 'Red' }
    })
    const { included: [selected] } = applySupabaseCatalogSelection([
      {
        id: 'vehicle-1',
        stock_number: 'B4298',
        vin: 'MPATFS40JRG000001',
        seller_id: 'northern-isuzu',
        sale_status: 'For Sale',
        listing_type: 'New',
        make: 'Isuzu',
        exterior_colour_generic: null
      }
    ], selection, {
      source_product_id: 'id',
      stock_id: 'stock_number',
      color: 'exterior_colour_generic'
    })

    expect(selected?.exterior_colour_generic).toBe('Red')
  })

  it('builds a governed vehicle URL from stock and title when the source has no URL column', () => {
    const selection = normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      makes: ['GWM'],
      listing_types: ['New'],
      required_fields: ['source_product_id', 'stock_id', 'product_url'],
      product_url_template: 'https://www.brightongwm.com.au/vehicle-for-sale/{stock_id}/{name_slug}?store=BrightonGWM'
    })
    const { included: [selected] } = applySupabaseCatalogSelection([
      {
        id: 'vehicle-1',
        stock_number: 'K625231',
        title: '2026 GWM Haval Jolion Premium A01',
        seller_id: 'brighton-gwm',
        sale_status: 'For Sale',
        listing_type: 'New',
        make: 'GWM'
      }
    ], selection, {
      source_product_id: 'id',
      stock_id: 'stock_number',
      name: 'title',
      product_url: 'product_url'
    })

    expect(selected?.product_url).toBe(
      'https://www.brightongwm.com.au/vehicle-for-sale/K625231/2026-gwm-haval-jolion-premium-a01?store=BrightonGWM'
    )
  })

  it('derives a stable XeroFlow Merchant offer ID from the governed stock ID', () => {
    const selection = normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      makes: ['GWM'],
      listing_types: ['New'],
      required_fields: ['source_product_id', 'stock_id', 'merchant_offer_id']
    })
    const { included: [selected] } = applySupabaseCatalogSelection([{
      id: 'vehicle-1',
      stock_number: 'K625231',
      seller_id: 'brighton-gwm',
      sale_status: 'For Sale',
      listing_type: 'New',
      make: 'GWM'
    }], selection, {
      source_product_id: 'id',
      stock_id: 'stock_number',
      merchant_offer_id: 'merchant_offer_id'
    })

    expect(selected?.merchant_offer_id).toBe('XF-K625231')
  })

  it('applies an explicit source currency when Supabase rows omit currency', () => {
    const selection = normalizeSupabaseCatalogSelection({
      seller_ids: ['northern-isuzu'],
      sale_statuses: ['For Sale'],
      makes: ['Isuzu'],
      listing_types: ['New'],
      required_fields: ['source_product_id', 'stock_id', 'price'],
      default_currency: 'AUD'
    })
    const { included: [selected] } = applySupabaseCatalogSelection([{
      id: 'vehicle-1',
      stock_number: 'N100',
      seller_id: 'northern-isuzu',
      sale_status: 'For Sale',
      listing_type: 'New',
      make: 'Isuzu',
      dap_price: 54990
    }], selection, {
      source_product_id: 'id',
      stock_id: 'stock_number',
      price: 'dap_price'
    })

    expect(selected?.currency).toBe('AUD')
    expect(normalizeCatalogItems([selected!])[0]?.currency).toBe('AUD')
  })

  it('rejects unsafe product URL templates', () => {
    expect(() => normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      listing_types: ['New'],
      required_fields: ['product_url'],
      product_url_template: 'http://localhost/vehicle/{stock_id}'
    })).toThrow('product_url_template')
  })

  it('rejects invalid colour override values', () => {
    expect(() => normalizeSupabaseCatalogSelection({
      seller_ids: ['northern-isuzu'],
      sale_statuses: ['For Sale'],
      listing_types: ['New'],
      required_fields: ['color'],
      color_overrides: { B4298: '' }
    })).toThrow('color_overrides')
  })

  it('uses explicit field mappings without accepting arbitrary column paths', () => {
    const mapped = normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      listing_types: ['New', 'Demo'],
      required_fields: ['source_product_id', 'stock_id', 'vin', 'color']
    })
    const result = applySupabaseCatalogSelection([{
      vehicle_id: 'vehicle-1', dealer: 'brighton-gwm', lifecycle: 'For Sale', stock_kind: 'Demo',
      stock_no: 'B1', chassis: 'VIN6', paint: 'Red'
    }], mapped, {
      source_product_id: 'vehicle_id', seller_id: 'dealer', sale_status: 'lifecycle',
      listing_type: 'stock_kind', stock_id: 'stock_no', vin: 'chassis', color: 'paint'
    })

    expect(result.included).toHaveLength(1)
    expect(() => normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      listing_types: ['New'],
      required_fields: ['password']
    })).toThrow(CatalogFeedError)
  })

  it('uses approved canonical aliases when the preferred mapped vehicle field is empty', () => {
    const selection = normalizeSupabaseCatalogSelection({
      seller_ids: ['brighton-gwm'],
      sale_statuses: ['For Sale'],
      makes: ['GWM'],
      listing_types: ['Demo'],
      required_fields: ['source_product_id', 'stock_id', 'price', 'color']
    })
    const { included: [selected] } = applySupabaseCatalogSelection([{
      id: 'vehicle-1',
      stock_number: 'B73572',
      seller_id: 'brighton-gwm',
      sale_status: 'For Sale',
      listing_type: 'Demo',
      make: 'GWM',
      dap_price: null,
      egc_price: 44990,
      exterior_colour_name: null,
      exterior_colour_generic: 'Grey'
    }], selection, {
      source_product_id: 'id',
      stock_id: 'stock_number',
      price: 'dap_price',
      color: 'exterior_colour_name'
    })

    expect(selected).toMatchObject({ egc_price: 44990, exterior_colour_generic: 'Grey' })
  })

  it('enforces the selection stored on the Supabase source and fails closed when absent', () => {
    const rows = [
      { id: 'live', seller_id: 'northern-isuzu-ute', sale_status: 'For Sale', make: 'Isuzu', listing_type: 'New', stock_number: 'N1', vin: 'VIN7', price: 1, url: 'https://example.com/live', image_url: 'https://example.com/live.jpg', color: 'White' },
      { id: 'sold', seller_id: 'northern-isuzu-ute', sale_status: 'SOLD', make: 'Isuzu', listing_type: 'New', stock_number: 'N2', vin: 'VIN8', price: 1, url: 'https://example.com/sold', image_url: 'https://example.com/sold.jpg', color: 'Black' }
    ]
    const source = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      source_type: 'supabase',
      status: 'active' as const,
      feed_url: 'https://example.supabase.co/',
      feed_format: 'json' as const,
      item_path: null,
      field_mapping: {},
      connection_config: { selection },
      secret_encrypted: new Uint8Array(),
      secret_iv: new Uint8Array()
    }

    expect(selectSupabaseCatalogRowsForSource(source, rows).map(row => row.id)).toEqual(['live'])
    expect(() => selectSupabaseCatalogRowsForSource({
      ...source,
      connection_config: { schema: 'public', table: 'vehicles' }
    }, rows)).toThrowError('Supabase catalog selection is not configured')
  })

  it('serves complete stock and reports incomplete Merchant exceptions', () => {
    const source = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      source_type: 'supabase',
      status: 'active' as const,
      feed_url: 'https://example.supabase.co/',
      feed_format: 'json' as const,
      item_path: null,
      field_mapping: { color: 'exterior_colour_name' },
      connection_config: {
        selection: normalizeSupabaseCatalogSelection({
          seller_ids: ['brighton-gwm'],
          sale_statuses: ['For Sale'],
          makes: ['GWM'],
          listing_types: ['New'],
          required_fields: ['source_product_id', 'stock_id', 'color']
        })
      },
      secret_encrypted: new Uint8Array(),
      secret_iv: new Uint8Array()
    }

    const result = selectSupabaseCatalogRowsWithDiagnostics(source, [
      {
        id: 'vehicle-complete',
        stock_number: 'K625231',
        seller_id: 'brighton-gwm',
        sale_status: 'For Sale',
        listing_type: 'New',
        make: 'GWM',
        exterior_colour_name: 'White'
      },
      {
        id: 'vehicle-incomplete',
        stock_number: 'K625232',
        seller_id: 'brighton-gwm',
        sale_status: 'For Sale',
        listing_type: 'New',
        make: 'GWM',
        exterior_colour_name: null
      }
    ])
    expect(result.included.map(row => row.id)).toEqual(['vehicle-complete'])
    expect(result.warning).toBe('Excluded products with incomplete required fields: color (1)')

    expect(() => selectSupabaseCatalogRowsWithDiagnostics(source, [{
      id: 'only-incomplete',
      stock_number: 'K625233',
      seller_id: 'brighton-gwm',
      sale_status: 'For Sale',
      listing_type: 'New',
      make: 'GWM',
      exterior_colour_name: null
    }])).toThrowError('required fields are incomplete: color (1)')
  })

  it('retires all prior products only after an authoritative Supabase read returns rows but no eligible stock', () => {
    expect(catalogSelectionCanRetireAll('supabase', 20, 0)).toBe(true)
    expect(catalogSelectionCanRetireAll('supabase', 0, 0)).toBe(false)
    expect(catalogSelectionCanRetireAll('feed', 20, 0)).toBe(false)
  })

  it('pushes exact governed selection filters and stable ordering into Supabase pagination', () => {
    const url = buildSupabaseCatalogPageUrl({
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      source_type: 'supabase',
      status: 'active',
      feed_url: 'https://example.supabase.co/',
      feed_format: 'json',
      item_path: null,
      field_mapping: {
        source_product_id: 'id',
        seller_id: 'seller_id',
        sale_status: 'sale_status',
        make: 'make',
        listing_type: 'listing_type'
      },
      connection_config: { table: 'vehicles', schema: 'public', selection: {
        seller_ids: ['brighton-gwm'],
        sale_statuses: ['For Sale'],
        makes: ['GWM'],
        listing_types: ['New', 'Demo'],
        required_fields: ['source_product_id']
      } },
      secret_encrypted: new Uint8Array(),
      secret_iv: new Uint8Array()
    }, 1000, 1000)

    expect(url.pathname).toBe('/rest/v1/vehicles')
    expect(url.searchParams.get('seller_id')).toBe('eq.brighton-gwm')
    expect(url.searchParams.get('sale_status')).toBe('eq.For Sale')
    expect(url.searchParams.get('make')).toBe('eq.GWM')
    expect(url.searchParams.get('listing_type')).toBe('in.("Demo","New")')
    expect(url.searchParams.get('order')).toBe('id.asc')
    expect(url.searchParams.get('offset')).toBe('1000')
  })
})

describe('catalog feed parsing', () => {
  it('omits ambiguous VIN identifiers while retaining unique stock identifiers', () => {
    expect(keepUnambiguousProductIdentifiers([
      { product_id: 'one', identifier_type: 'vin', normalized_value: 'duplicate-vin' },
      { product_id: 'two', identifier_type: 'vin', normalized_value: 'duplicate-vin' },
      { product_id: 'one', identifier_type: 'stock_id', normalized_value: 'stock-one' },
      { product_id: 'two', identifier_type: 'stock_id', normalized_value: 'stock-two' }
    ])).toEqual([
      { product_id: 'one', identifier_type: 'stock_id', normalized_value: 'stock-one' },
      { product_id: 'two', identifier_type: 'stock_id', normalized_value: 'stock-two' }
    ])
  })

  it('extracts a nested JSON vehicle list and normalizes identifiers', () => {
    const rows = parseCatalogFeed(JSON.stringify({
      payload: {
        vehicles: [{
          vehicleId: 'car-1',
          stockNo: 'SM-100',
          vehicleVin: 'abc123',
          label: '2026 Example One',
          status: 'for_sale',
          amount: '$54,990',
          currency: 'aud'
        }]
      }
    }), 'json', 'payload.vehicles')
    const items = normalizeCatalogItems(rows, {
      source_product_id: 'vehicleId',
      stock_id: 'stockNo',
      vin: 'vehicleVin',
      name: 'label',
      price: 'amount'
    })

    expect(items).toMatchObject([{
      source_product_id: 'car-1',
      stock_id: 'SM-100',
      vin: 'abc123',
      name: '2026 Example One',
      availability: 'available',
      price: 54990,
      currency: 'AUD',
      product_type: 'vehicle'
    }])
  })

  it('parses quoted CSV fields', () => {
    const rows = parseCatalogFeed(
      'id,name,price\n1,"Example, Premium","$42,500"\n',
      'csv'
    )
    expect(normalizeCatalogItems(rows)).toMatchObject([{
      source_product_id: '1',
      name: 'Example, Premium',
      price: 42500
    }])
  })

  it('deduplicates repeated source IDs using the latest feed row', () => {
    const items = normalizeCatalogItems([
      { id: '1', name: 'Old', status: 'available' },
      { id: '1', name: 'Current', status: 'sold' }
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Current', availability: 'sold' })
  })

  it('normalizes the exact source status For Sale to available', () => {
    expect(normalizeCatalogItems([{ id: '1', sale_status: 'For Sale' }], {
      source_product_id: 'id',
      availability: 'sale_status'
    })[0]?.availability).toBe('available')
  })

  it('retains canonical campaign identity attributes after source mapping', () => {
    const [item] = normalizeCatalogItems([{
      id: 'vehicle-1', offer: 'offer-1', dealer: 'dealer-1', status: 'For Sale',
      condition: 'Demo', manufacturer: 'GWM', model_name: 'Cannon', paint: 'Blue'
    }], {
      source_product_id: 'id',
      merchant_offer_id: 'offer',
      seller_id: 'dealer',
      sale_status: 'status',
      listing_type: 'condition',
      make: 'manufacturer',
      model: 'model_name',
      color: 'paint'
    })

    expect(item?.attributes).toMatchObject({
      merchant_offer_id: 'offer-1',
      seller_id: 'dealer-1',
      sale_status: 'For Sale',
      listing_type: 'Demo',
      make: 'GWM',
      model: 'Cannon',
      color: 'Blue'
    })
  })
})

describe('catalog feed URL safety', () => {
  it('accepts public HTTPS feeds', () => {
    expect(validateCatalogFeedUrl('https://inventory.example.com/feed.json#latest'))
      .toBe('https://inventory.example.com/feed.json')
  })

  it.each([
    'http://inventory.example.com/feed.json',
    'https://localhost/feed.json',
    'https://127.0.0.1/feed.json',
    'https://inventory.example.com/feed.json?api_key=secret',
    'https://user:password@inventory.example.com/feed.json'
  ])('rejects unsafe or credential-bearing URLs: %s', (value) => {
    expect(() => validateCatalogFeedUrl(value)).toThrow(CatalogFeedError)
  })
})
