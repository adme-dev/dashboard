import { describe, expect, it, vi } from 'vitest'
import {
  buildGoogleMerchantVehicleProductInput,
  createGoogleMerchantVehicleClient,
  googleMerchantProductInputResourceId,
  GoogleMerchantVehicleCatalogError,
  planGoogleMerchantVehicleReconciliation
} from '~~/server/utils/googleMerchantVehicleCatalog'

const product = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceProductId: 'source-1',
  stockId: 'B4873M',
  name: '2024 GWM Haval H6 Ultra',
  price: 52952,
  currency: 'AUD',
  productUrl: 'https://www.brightongwm.com.au/vehicle-for-sale/B4873M/gwm-haval-h6',
  primaryImageUrl: 'https://cdn.example.test/B4873M.jpg',
  availability: 'available',
  attributes: {
    merchant_offer_id: 'XF-B4873M',
    sale_status: 'For Sale',
    listing_type: 'New',
    make: 'GWM',
    model: 'Haval H6',
    series: 'Ultra',
    body_style: 'SUV',
    build_year: '2024',
    odometer_reading: '12',
    odometer_unit: 'KM',
    color: 'Red',
    vin: 'LGWFF6A50NH123456',
    description: 'Available now from Brighton GWM.'
  }
}

const config = {
  merchantAccountId: '5817965641',
  dataSource: 'accounts/5817965641/dataSources/10705708313',
  feedLabel: 'AU',
  contentLanguage: 'en',
  storeCode: 'BrightonGWM'
}

describe('Google Merchant vehicle ProductInput contract', () => {
  it('maps an exact For Sale vehicle to the current Merchant API Vehicle Ads shape', () => {
    expect(buildGoogleMerchantVehicleProductInput(product, config)).toEqual({
      offerId: 'XF-B4873M',
      contentLanguage: 'en',
      feedLabel: 'AU',
      channel: 'LOCAL',
      productAttributes: {
        title: '2024 GWM Haval H6 Ultra',
        description: 'Available now from Brighton GWM.',
        link: product.productUrl,
        imageLink: product.primaryImageUrl,
        availability: 'IN_STOCK',
        price: { amountMicros: '52952000000', currencyCode: 'AUD' },
        condition: 'NEW',
        brand: 'GWM',
        color: 'Red',
        googleProductCategory: '916',
        includedDestinations: ['VEHICLE_ADS'],
        vin: 'LGWFF6A50NH123456',
        model: 'Haval H6',
        trim: 'Ultra',
        bodyStyle: 'SUV',
        year: '2024',
        mileage: { value: '12', unit: 'KM' },
        vehiclePriceType: 'DRIVE_AWAY_PRICE'
      },
      customAttributes: [{
        name: 'vehicle_fulfillment',
        groupValues: [
          { name: 'option', value: 'in_store' },
          { name: 'store_code', value: 'BrightonGWM' }
        ]
      }]
    })
  })

  it('keeps Demo labelling in XeroFlow while publishing the Google condition as USED', () => {
    const input = buildGoogleMerchantVehicleProductInput({
      ...product,
      attributes: { ...product.attributes, listing_type: 'Demo' }
    }, config)

    expect(input.productAttributes.condition).toBe('USED')
    expect(product.attributes.listing_type).toBe('New')
  })

  it('accepts zero kilometres for a new in-stock vehicle', () => {
    const input = buildGoogleMerchantVehicleProductInput({
      ...product,
      attributes: { ...product.attributes, odometer_reading: 0 }
    }, config)

    expect(input.productAttributes.mileage).toEqual({ value: '0', unit: 'KM' })
  })

  it.each(['Sold', 'Withdrawn', 'Reserved'])('refuses a %s vehicle before any provider write', (saleStatus) => {
    expect(() => buildGoogleMerchantVehicleProductInput({
      ...product,
      attributes: { ...product.attributes, sale_status: saleStatus }
    }, config)).toThrow(GoogleMerchantVehicleCatalogError)
  })

  it('refuses a malformed VIN before any provider write', () => {
    expect(() => buildGoogleMerchantVehicleProductInput({
      ...product,
      attributes: { ...product.attributes, vin: 'NOT-A-VIN' }
    }, config)).toThrow(GoogleMerchantVehicleCatalogError)
  })

  it('uses the encoded local product-input identifier required for safe delete calls', () => {
    expect(googleMerchantProductInputResourceId({
      contentLanguage: 'en', feedLabel: 'AU', offerId: 'XF/B4873M'
    })).toBe(Buffer.from('local~en~AU~XF/B4873M').toString('base64url'))
  })
})

describe('Google Merchant vehicle reconciliation plan', () => {
  it('publishes only unambiguous active VINs and deletes previously submitted vehicles no longer eligible', () => {
    const second = {
      ...product,
      id: '22222222-2222-4222-8222-222222222222',
      sourceProductId: 'source-2',
      stockId: 'B4874M',
      attributes: {
        ...product.attributes,
        merchant_offer_id: 'XF-B4874M',
        vin: 'LGWFF6A50NH123457'
      }
    }
    const duplicate = {
      ...product,
      id: '33333333-3333-4333-8333-333333333333',
      sourceProductId: 'source-3',
      stockId: 'B4875M',
      attributes: {
        ...product.attributes,
        merchant_offer_id: 'XF-B4875M'
      }
    }

    const plan = planGoogleMerchantVehicleReconciliation({
      products: [product, second, duplicate],
      publications: [{
        productId: '44444444-4444-4444-8444-444444444444',
        offerId: 'XF-SOLD',
        state: 'SUBMITTED'
      }],
      config
    })

    expect(plan.publish).toEqual([
      expect.objectContaining({ productId: second.id, offerId: 'XF-B4874M' })
    ])
    expect(plan.delete).toEqual([{
      productId: '44444444-4444-4444-8444-444444444444',
      offerId: 'XF-SOLD'
    }])
    expect(plan.excluded).toEqual(expect.arrayContaining([
      { productId: product.id, offerId: 'XF-B4873M', reason: 'DUPLICATE_VIN' },
      { productId: duplicate.id, offerId: 'XF-B4875M', reason: 'DUPLICATE_VIN' }
    ]))
  })

  it('plans deletion for a previously submitted duplicate VIN so ambiguity cannot stay advertised', () => {
    const duplicate = {
      ...product,
      id: '33333333-3333-4333-8333-333333333333',
      attributes: { ...product.attributes, merchant_offer_id: 'XF-B4875M' }
    }
    const plan = planGoogleMerchantVehicleReconciliation({
      products: [product, duplicate],
      publications: [{ productId: product.id, offerId: 'XF-B4873M', state: 'SUBMITTED' }],
      config
    })

    expect(plan.publish).toHaveLength(0)
    expect(plan.delete).toEqual([{ productId: product.id, offerId: 'XF-B4873M' }])
  })

  it('excludes every row in a duplicate offer-ID group even when its VINs differ', () => {
    const duplicateOffer = {
      ...product,
      id: '33333333-3333-4333-8333-333333333333',
      attributes: { ...product.attributes, vin: 'LGWFF6A50NH123457' }
    }
    const plan = planGoogleMerchantVehicleReconciliation({
      products: [product, duplicateOffer],
      publications: [],
      config
    })

    expect(plan.publish).toHaveLength(0)
    expect(plan.excluded).toEqual(expect.arrayContaining([
      { productId: product.id, offerId: 'XF-B4873M', reason: 'DUPLICATE_OFFER_ID' },
      { productId: duplicateOffer.id, offerId: 'XF-B4873M', reason: 'DUPLICATE_OFFER_ID' }
    ]))
  })
})

describe('Google Merchant vehicle HTTP client', () => {
  it('lists processed products and preserves Vehicle Ads status evidence across pages', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        products: [{
          name: 'accounts/5817965641/products/local~en~AU~XF-ONE',
          offerId: 'XF-ONE',
          contentLanguage: 'en',
          feedLabel: 'AU',
          dataSource: 'accounts/5817965641/dataSources/200',
          productStatus: {
            destinationStatuses: [{
              reportingContext: 'VEHICLE_INVENTORY_ADS',
              approvedCountries: ['AU']
            }],
            itemLevelIssues: []
          }
        }],
        nextPageToken: 'next-page'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [] }), { status: 200 }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.listProducts('5817965641')).resolves.toEqual([
      expect.objectContaining({
        offerId: 'XF-ONE',
        dataSource: 'accounts/5817965641/dataSources/200',
        productStatus: expect.objectContaining({
          destinationStatuses: [expect.objectContaining({
            reportingContext: 'VEHICLE_INVENTORY_ADS',
            approvedCountries: ['AU']
          })]
        })
      })
    ])
    expect(fetch.mock.calls[1]?.[0]).toContain('pageToken=next-page')
  })

  it('lists API data sources across pages so a retry can reuse the exact governed source', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        dataSources: [{
          name: 'accounts/5817965641/dataSources/199',
          displayName: 'Old file',
          primaryProductDataSource: { legacyLocal: true },
          fileInput: { fileName: 'vehicles.xml' }
        }],
        nextPageToken: 'page-2'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        dataSources: [{
          name: 'accounts/5817965641/dataSources/200',
          displayName: 'XeroFlow Vehicle Inventory',
          primaryProductDataSource: { legacyLocal: true }
        }]
      }), { status: 200 }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.listDataSources('5817965641')).resolves.toEqual([
      expect.objectContaining({ name: 'accounts/5817965641/dataSources/199', inputType: 'FILE' }),
      expect.objectContaining({ name: 'accounts/5817965641/dataSources/200', writableByApi: true })
    ])
    expect(fetch.mock.calls[1]?.[0]).toContain('pageToken=page-2')
  })

  it('classifies an existing file source as non-writable', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: config.dataSource,
      displayName: 'PRODUCTS SOURCE 1',
      primaryProductDataSource: { legacyLocal: true },
      fileInput: { fileName: 'vehicles.xml' }
    }), { status: 200 }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.getDataSource(config.dataSource)).resolves.toMatchObject({
      writableByApi: false,
      inputType: 'FILE'
    })
  })

  it('preserves only the safe HTTP status when a Merchant request is rejected', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 403, message: 'sensitive provider detail' }
    }), { status: 403 }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.getDataSource(config.dataSource)).rejects.toMatchObject({
      code: 'MERCHANT_VEHICLE_REQUEST_FAILED',
      httpStatus: 403,
      message: 'MERCHANT_VEHICLE_REQUEST_FAILED'
    })
  })

  it('creates a Vehicle Ads-only local API source using the official data-source contract', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'accounts/5817965641/dataSources/200',
      displayName: 'XeroFlow Vehicle Inventory',
      primaryProductDataSource: { legacyLocal: true }
    }), { status: 200 }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.createVehicleDataSource({
      merchantAccountId: '5817965641',
      displayName: 'XeroFlow Vehicle Inventory',
      feedLabel: 'AU',
      contentLanguage: 'en'
    })).resolves.toMatchObject({ writableByApi: true, inputType: 'API' })
    expect(fetch).toHaveBeenCalledWith(
      'https://merchantapi.googleapis.com/datasources/v1/accounts/5817965641/dataSources',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'XeroFlow Vehicle Inventory',
          primaryProductDataSource: {
            legacyLocal: true,
            feedLabel: 'AU',
            contentLanguage: 'en',
            countries: ['AU'],
            destinations: [{ destination: 'VEHICLE_ADS', state: 'ENABLED' }]
          }
        })
      })
    )
  })

  it('registers the connector cloud project through the official one-time Merchant endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'x-request-id': 'registration-request' }
    }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })

    await expect(client.registerDeveloper({
      merchantAccountId: '5817965641',
      developerEmail: 'advertising@adme.net.au'
    })).resolves.toEqual({ requestId: 'registration-request' })
    expect(fetch).toHaveBeenCalledWith(
      'https://merchantapi.googleapis.com/accounts/v1/accounts/5817965641/developerRegistration:registerGcp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ developerEmail: 'advertising@adme.net.au' })
      })
    )
  })

  it('inserts and deletes only within the exact account and API data source', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: 'accounts/5817965641/productInputs/local~en~AU~XF-B4873M',
        product: 'accounts/5817965641/products/local~en~AU~XF-B4873M',
        offerId: 'XF-B4873M'
      }), { status: 200, headers: { 'x-request-id': 'insert-request' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'x-request-id': 'delete-request' } }))
    const client = createGoogleMerchantVehicleClient({ accessToken: 'token', fetch })
    const input = buildGoogleMerchantVehicleProductInput(product, config)

    await expect(client.insertProduct({
      merchantAccountId: config.merchantAccountId,
      dataSource: config.dataSource,
      productInput: input
    })).resolves.toMatchObject({ offerId: 'XF-B4873M', requestId: 'insert-request' })
    await expect(client.deleteProduct({
      merchantAccountId: config.merchantAccountId,
      dataSource: config.dataSource,
      contentLanguage: 'en',
      feedLabel: 'AU',
      offerId: 'XF-B4873M'
    })).resolves.toEqual({ requestId: 'delete-request' })

    expect(fetch.mock.calls[0]?.[0]).toContain('/accounts/5817965641/productInputs:insert?dataSource=accounts%2F5817965641%2FdataSources%2F10705708313')
    expect(fetch.mock.calls[1]?.[0]).toContain('/accounts/5817965641/productInputs/')
    expect(fetch.mock.calls[1]?.[0]).toContain('?dataSource=accounts%2F5817965641%2FdataSources%2F10705708313')
  })
})
