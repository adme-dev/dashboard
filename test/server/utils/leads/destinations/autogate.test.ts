import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead, LeadDelivery } from '~~/app/types'

vi.mock('../../../../../server/utils/leads/destinations/registry', () => ({
  registerAdapter: vi.fn()
}))

const { default: adapter } = await import('../../../../../server/utils/leads/destinations/autogate')

const lead = {
  id: 'a7d9987c-d716-4c90-bb26-e53c725dcf98',
  client_id: 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0',
  source: 'meta',
  source_lead_id: '1039038265554857',
  form_id: '1399083985579377',
  form_name: 'NMG_EV_Centre_May_2026 (v1)',
  ad_id: '120244032522930320',
  ad_name: 'Convert_M_AIA_Leads_Image_Carousel',
  campaign_id: '120244032522920320',
  campaign_name: 'Convert_Fixed_Meta_M_AIA_Leads_Northern_Motor_Group_EV_Centre',
  page_id: '377100258985904',
  submitted_at: '2026-08-16T15:06:06.000Z',
  ingested_at: '2026-08-16T15:06:07.000Z',
  field_data: {
    full_name: 'Jane Citizen',
    email: 'jane@example.com',
    phone_number: '0400 123 456',
    postcode: '3076',
    vehicle_stock_number: 'B4789X',
    vehicle_make: 'Kia',
    vehicle_model: 'EV6',
    have_you_owned_or_driven_an_ev_before: 'Yes'
  },
  attribution: { retailer_item_id: 'B4789X' },
  status: 'new'
} as Lead

const delivery = {
  id: '9c253221-8e1f-4612-af9e-e1d58ad899fe',
  lead_id: lead.id,
  idempotency_key: 'autogate-idempotency-key',
  destination_type: 'autogate'
} as LeadDelivery

const config = {
  sellerIdentifier: '90123ba8-ae7e-5e4c-bcc1-f46a00afb2e8',
  service: 'ADME',
  leadType: 'Used',
  siteOrigin: 'northernmotorgroup.com.au',
  pageSource: 'details',
  ipAddress: '45.63.26.219',
  tags: ['Meta', 'Northern EV Centre']
}

describe('AutoGate lead destination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    process.env.AUTOGATE_LEAD_API_USERNAME = 'integration@example.com'
    process.env.AUTOGATE_LEAD_API_PASSWORD = 'test-password'
    delete process.env.AUTOGATE_LEAD_API_VERSION
  })

  it('sends the working V2 carsales payload with Basic authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      '"a7d9987c-d716-4c90-bb26-e53c725dcf98"',
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await adapter.dispatch(delivery, lead, config)

    expect(result).toEqual({
      status: 'delivered',
      response_meta: {
        http_status: 200,
        api_version: 'v2',
        autogate_lead_id: 'a7d9987c-d716-4c90-bb26-e53c725dcf98'
      }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://lead-api.carsalesnetwork.com.au/v2/leads')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('integration@example.com:test-password').toString('base64')}`
    )

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      UniqueIdentifier: lead.id,
      SellerIdentifier: config.sellerIdentifier,
      Service: 'ADME',
      LeadType: 'Used',
      ItemType: 'Car',
      RequestType: 'Dealer',
      Status: 'New',
      Environment: {
        SiteOrigin: 'northernmotorgroup.com.au',
        PageSource: 'details',
        IPAddress: '45.63.26.219'
      },
      Prospect: {
        FirstName: 'Jane',
        LastName: 'Citizen',
        Email: 'jane@example.com',
        HomePhone: '0400 123 456',
        MobilePhone: '0400 123 456',
        Postcode: '3076'
      },
      Item: {
        StockNumber: 'B4789X',
        Make: 'Kia',
        Model: 'EV6'
      },
      Tags: ['Meta', 'Northern EV Centre']
    })
    expect(body.Identifier).toBeUndefined()
    expect(body.Comments).toContain('Have you owned or driven an ev before: Yes')
  })

  it('flips to the V3 endpoint and Identifier field through one environment switch', async () => {
    process.env.AUTOGATE_LEAD_API_VERSION = 'v3'
    const fetchMock = vi.fn().mockResolvedValue(new Response(`"${lead.id}"`, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await adapter.dispatch(delivery, lead, config)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(url).toBe('https://lead-api.carsalesnetwork.com.au/v3/leads')
    expect(body.Identifier).toBe(lead.id)
    expect(body.UniqueIdentifier).toBeUndefined()
  })

  it('marks carsales 4xx validation failures as final', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"message":"SellerIdentifier is invalid"}', { status: 400 })
    ))

    const result = await adapter.dispatch(delivery, lead, config)

    expect(result).toEqual({
      status: 'failed',
      error: 'autogate_http_400: SellerIdentifier is invalid',
      final: true
    })
  })

  it('leaves carsales 5xx failures retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('temporary outage', { status: 503 })
    ))

    const result = await adapter.dispatch(delivery, lead, config)

    expect(result).toEqual({
      status: 'failed',
      error: 'autogate_http_503: temporary outage'
    })
  })

  it('rejects invalid dealer routing configuration', () => {
    expect(adapter.validateConfig({ ...config, sellerIdentifier: 'not-a-guid' }).valid).toBe(false)
    expect(adapter.validateConfig({ ...config, siteOrigin: 'https://northernmotorgroup.com.au/path' }).valid).toBe(false)
    expect(adapter.validateConfig({ ...config, ipAddress: 'not-an-ip' }).valid).toBe(false)
    expect(adapter.validateConfig({
      ...config,
      sellerIdentifier: '52e4b849-4a82-8b43-3923-046ffd1a8e8c'
    }).valid).toBe(true)
    expect(adapter.validateConfig(config).valid).toBe(true)
  })
})
