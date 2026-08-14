import { describe, expect, it, vi } from 'vitest'
import {
  createMerchantCatalogReadback,
  createMerchantCatalogReconciler
} from '../../../workers/google-pmax-provider/src/merchantCatalogReconciler'

const request = {
  tenantId: 'tenant-1',
  clientId: '11111111-1111-4111-8111-111111111111',
  sourceId: '22222222-2222-4222-8222-222222222222',
  connection: {
    id: '33333333-3333-4333-8333-333333333333',
    clientId: '11111111-1111-4111-8111-111111111111',
    status: 'active' as const,
    customerId: '3437087580',
    accessToken: 'merchant-access-token',
    developerToken: 'developer-token'
  },
  merchantAccessToken: 'merchant-access-token',
  merchantCredentialProfileId: '99999999-9999-4999-8999-999999999999',
  merchantRegistrationAccountId: '551257489'
}

const merchant = {
  tenant_id: 'tenant-1',
  account_id: '5817965641',
  data_source: 'accounts/5817965641/dataSources/100',
  feed_label: 'AU',
  content_language: 'en',
  store_code: 'BrightonGWM',
  auto_publish: true,
  api_source_display_name: 'XeroFlow Vehicle Inventory · Brighton GWM',
  developer_email: 'advertising@adme.net.au',
  credential_profile_id: request.merchantCredentialProfileId,
  registration_account_id: request.merchantRegistrationAccountId,
  ads_connection_id: request.connection.id,
  ads_customer_id: request.connection.customerId
}

function vehicle(id: string, offerId: string, vin: string) {
  return {
    id,
    sourceProductId: `source-${id}`,
    stockId: offerId,
    name: `2026 GWM Haval ${offerId}`,
    price: 45000,
    currency: 'AUD',
    productUrl: `https://www.brightongwm.com.au/vehicle-for-sale/${offerId}`,
    primaryImageUrl: `https://cdn.example.test/${offerId}.jpg`,
    availability: 'available',
    attributes: {
      merchant_offer_id: offerId,
      sale_status: 'For Sale',
      listing_type: 'New',
      make: 'GWM',
      model: 'Haval H6',
      build_year: '2026',
      odometer_reading: 10,
      dap_price: 45000,
      color: 'White',
      vin
    }
  }
}

function apiSource(name = merchant.data_source) {
  return {
    name,
    displayName: merchant.api_source_display_name,
    inputType: 'API' as const,
    writableByApi: true,
    primaryProductDataSource: {
      legacyLocal: true,
      feedLabel: 'AU',
      contentLanguage: 'en',
      countries: ['AU'],
      destinations: [{ destination: 'VEHICLE_ADS', state: 'ENABLED' }]
    }
  }
}

describe('governed Merchant catalog reconciler', () => {
  it('submits only unique eligible VINs and durably records duplicate exclusions', async () => {
    const finishRun = vi.fn()
    const repository = {
      loadScope: vi.fn().mockResolvedValue({
        source: {
          id: request.sourceId,
          clientId: request.clientId,
          displayName: 'Brighton GWM',
          connectionConfig: { merchant }
        },
        products: [
          vehicle('44444444-4444-4444-8444-444444444444', 'XF-ONE', 'LGWFF6A50NH123456'),
          vehicle('55555555-5555-4555-8555-555555555555', 'XF-DUP-1', 'LGWFF6A50NH123457'),
          vehicle('66666666-6666-4666-8666-666666666666', 'XF-DUP-2', 'LGWFF6A50NH123457')
        ],
        publications: []
      }),
      setDataSource: vi.fn(),
      beginRun: vi.fn().mockResolvedValue('77777777-7777-4777-8777-777777777777'),
      finishRun
    }
    const client = {
      inspectAuthorization: vi.fn(),
      getDataSource: vi.fn().mockResolvedValue(apiSource()),
      listDataSources: vi.fn(),
      createVehicleDataSource: vi.fn(),
      registerDeveloper: vi.fn(),
      insertProduct: vi.fn().mockResolvedValue({
        name: 'accounts/5817965641/productInputs/one',
        product: 'accounts/5817965641/products/one',
        offerId: 'XF-ONE',
        requestId: 'merchant-request-1'
      }),
      deleteProduct: vi.fn()
    }
    const dependenciesCreateClient = vi.fn().mockReturnValue(client)
    const reconcile = createMerchantCatalogReconciler({
      repository,
      createClient: dependenciesCreateClient as never
    })

    await expect(reconcile(request)).resolves.toMatchObject({
      publishCount: 1,
      deleteCount: 0,
      excludedCount: 2,
      exclusionSummary: { DUPLICATE_VIN: 2 },
      failedCount: 0,
      processingState: 'SUBMITTED_AWAITING_GOOGLE_READBACK'
    })
    expect(dependenciesCreateClient).toHaveBeenCalledWith({
      accessToken: 'merchant-access-token'
    })
    expect(client.insertProduct).toHaveBeenCalledTimes(1)
    expect(repository.beginRun).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemCount: 3,
      exclusionSummary: { DUPLICATE_VIN: 2 }
    }))
    expect(finishRun).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777',
      [expect.objectContaining({ action: 'PUBLISH', ok: true, offerId: 'XF-ONE' })]
    )
  })

  it('reuses the one exact API source when the configured source is a legacy file', async () => {
    const replacement = 'accounts/5817965641/dataSources/200'
    const repository = {
      loadScope: vi.fn().mockResolvedValue({
        source: {
          id: request.sourceId,
          clientId: request.clientId,
          displayName: 'Brighton GWM',
          connectionConfig: { merchant }
        },
        products: [],
        publications: []
      }),
      setDataSource: vi.fn(),
      beginRun: vi.fn().mockResolvedValue('77777777-7777-4777-8777-777777777777'),
      finishRun: vi.fn()
    }
    const client = {
      inspectAuthorization: vi.fn(),
      getDataSource: vi.fn().mockResolvedValue({
        ...apiSource(), inputType: 'FILE', writableByApi: false, fileInput: { fileName: 'old.xml' }
      }),
      listDataSources: vi.fn().mockResolvedValue([apiSource(replacement)]),
      createVehicleDataSource: vi.fn(),
      registerDeveloper: vi.fn(),
      insertProduct: vi.fn(),
      deleteProduct: vi.fn()
    }
    const reconcile = createMerchantCatalogReconciler({
      repository,
      createClient: vi.fn().mockReturnValue(client) as never
    })

    await expect(reconcile(request)).resolves.toMatchObject({ dataSource: replacement })
    expect(repository.setDataSource).toHaveBeenCalledWith(request.sourceId, request.clientId, replacement)
    expect(client.createVehicleDataSource).not.toHaveBeenCalled()
  })

  it('registers the cloud project once when Google blocks an unregistered connector', async () => {
    const repository = {
      loadScope: vi.fn().mockResolvedValue({
        source: {
          id: request.sourceId,
          clientId: request.clientId,
          displayName: 'Brighton GWM',
          connectionConfig: { merchant }
        },
        products: [],
        publications: []
      }),
      setDataSource: vi.fn(),
      beginRun: vi.fn().mockResolvedValue('77777777-7777-4777-8777-777777777777'),
      finishRun: vi.fn()
    }
    const client = {
      inspectAuthorization: vi.fn().mockResolvedValue({
        tokenValid: true, contentScopeGranted: true, developerEmailMatches: true
      }),
      getDataSource: vi.fn()
        .mockRejectedValueOnce({
          code: 'MERCHANT_VEHICLE_REQUEST_FAILED', httpStatus: 401
        })
        .mockResolvedValueOnce(apiSource()),
      listDataSources: vi.fn(),
      createVehicleDataSource: vi.fn(),
      registerDeveloper: vi.fn().mockResolvedValue({ requestId: 'registration-request' }),
      insertProduct: vi.fn(),
      deleteProduct: vi.fn()
    }
    const reconcile = createMerchantCatalogReconciler({
      repository,
      createClient: vi.fn().mockReturnValue(client) as never
    })

    await expect(reconcile(request)).resolves.toMatchObject({ publishCount: 0 })
    expect(client.registerDeveloper).toHaveBeenCalledWith({
      merchantAccountId: '551257489',
      developerEmail: 'advertising@adme.net.au'
    })
    expect(client.inspectAuthorization).toHaveBeenCalledWith({
      developerEmail: 'advertising@adme.net.au'
    })
    expect(client.getDataSource).toHaveBeenCalledTimes(2)
  })

  it('records official Vehicle Ads processed, disapproved, and pending states', async () => {
    const verifyPublications = vi.fn()
    const repository = {
      loadScope: vi.fn().mockResolvedValue({
        source: {
          id: request.sourceId,
          clientId: request.clientId,
          displayName: 'Brighton GWM',
          connectionConfig: { merchant }
        },
        products: [],
        publications: [
          { productId: '44444444-4444-4444-8444-444444444444', offerId: 'XF-OK', state: 'SUBMITTED' },
          { productId: '55555555-5555-4555-8555-555555555555', offerId: 'XF-BAD', state: 'SUBMITTED' },
          { productId: '66666666-6666-4666-8666-666666666666', offerId: 'XF-WAIT', state: 'SUBMITTED' },
          { productId: '77777777-7777-4777-8777-777777777777', offerId: 'XF-DELETED', state: 'DELETION_SUBMITTED' }
        ]
      }),
      setDataSource: vi.fn(),
      beginRun: vi.fn(),
      finishRun: vi.fn(),
      verifyPublications
    }
    const client = {
      listProducts: vi.fn().mockResolvedValue([
        {
          name: 'accounts/5817965641/products/ok', offerId: 'XF-OK',
          dataSource: merchant.data_source,
          productStatus: {
            destinationStatuses: [{ reportingContext: 'VEHICLE_INVENTORY_ADS', approvedCountries: ['AU'] }],
            itemLevelIssues: []
          }
        },
        {
          name: 'accounts/5817965641/products/bad', offerId: 'XF-BAD',
          dataSource: merchant.data_source,
          productStatus: {
            destinationStatuses: [{ reportingContext: 'VEHICLE_INVENTORY_ADS', disapprovedCountries: ['AU'] }],
            itemLevelIssues: [{
              code: 'missing_color', severity: 'ERROR', attribute: 'color',
              reportingContext: 'VEHICLE_INVENTORY_ADS', applicableCountries: ['AU']
            }]
          }
        },
        {
          name: 'accounts/5817965641/products/legacy', offerId: 'XF-WAIT',
          dataSource: 'accounts/5817965641/dataSources/999',
          productStatus: {
            destinationStatuses: [{ reportingContext: 'VEHICLE_INVENTORY_ADS', approvedCountries: ['AU'] }],
            itemLevelIssues: []
          }
        }
      ])
    }
    const readback = createMerchantCatalogReadback({
      repository,
      createClient: vi.fn().mockReturnValue(client) as never
    })

    await expect(readback(request)).resolves.toMatchObject({
      processedCount: 1,
      disapprovedCount: 1,
      pendingCount: 1,
      deletedCount: 1,
      deletionPendingCount: 0,
      processingState: 'GOOGLE_READBACK_PARTIAL'
    })
    expect(verifyPublications).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ offerId: 'XF-OK', state: 'PROCESSED', issues: [] }),
      expect.objectContaining({
        offerId: 'XF-BAD', state: 'DISAPPROVED',
        issues: [expect.objectContaining({ code: 'missing_color', attribute: 'color' })]
      }),
      expect.objectContaining({ offerId: 'XF-WAIT', state: 'SUBMITTED', issues: [] }),
      expect.objectContaining({ offerId: 'XF-DELETED', state: 'DELETED', issues: [] })
    ]))
  })
})
