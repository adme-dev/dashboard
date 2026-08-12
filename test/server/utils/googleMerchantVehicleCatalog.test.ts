import { describe, expect, it, vi } from 'vitest'
import {
  buildGoogleMerchantVehicleProductInput,
  createGoogleMerchantVehicleClient,
  googleMerchantProductInputResourceId,
  GoogleMerchantVehicleCatalogError
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

  it('uses the encoded local product-input identifier required for safe delete calls', () => {
    expect(googleMerchantProductInputResourceId({
      contentLanguage: 'en', feedLabel: 'AU', offerId: 'XF/B4873M'
    })).toBe(Buffer.from('local~en~AU~XF/B4873M').toString('base64url'))
  })
})

describe('Google Merchant vehicle HTTP client', () => {
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
            destinations: [{ destination: 'VEHICLE_ADS', status: 'ENABLED' }]
          }
        })
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
