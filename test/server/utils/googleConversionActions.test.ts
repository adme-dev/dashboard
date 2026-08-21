import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleConversionActionDiscovery,
  createGoogleConversionActionMutation,
  createGoogleConversionActionProvisioner
} from '~~/server/utils/googleConversionActions'
import type { GoogleConversionActionDiscoveryError } from '~~/server/utils/googleConversionActions'

describe('Google conversion-action discovery', () => {
  it('returns only the redacted fields required to map an eligible Data Manager destination', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        conversionAction: {
          resourceName: 'customers/3584435581/conversionActions/9001',
          id: '9001',
          name: 'XeroFlow qualified lead',
          status: 'ENABLED',
          type: 'UPLOAD_CLICKS',
          category: 'QUALIFIED_LEAD',
          origin: 'WEBSITE',
          primaryForGoal: false,
          includeInConversionsMetric: true
        }
      },
      {
        conversionAction: {
          resourceName: 'customers/3584435581/conversionActions/9002',
          id: '9002',
          name: 'Website lead',
          status: 'ENABLED',
          type: 'WEBPAGE',
          category: 'SUBMIT_LEAD_FORM',
          origin: 'WEBSITE',
          primaryForGoal: true,
          includeInConversionsMetric: true
        }
      }
    ])
    const discovery = createGoogleConversionActionDiscovery({ query })

    const result = await discovery.list({
      accountId: '3584435581',
      accessToken: 'must-not-leak',
      developerToken: 'must-not-leak',
      loginCustomerId: '5250473322',
      page: 1,
      pageSize: 50
    })

    expect(query).toHaveBeenCalledWith(
      '3584435581',
      'must-not-leak',
      'must-not-leak',
      expect.stringMatching(/status = 'ENABLED'[\s\S]+type IN \('UPLOAD_CLICKS', 'WEBPAGE'\)[\s\S]+LIMIT 51/),
      '5250473322'
    )
    expect(String(query.mock.calls[0]?.[3])).not.toContain('OFFSET')
    expect(result).toEqual({
      items: [
        {
          id: '9001',
          resourceName: 'customers/3584435581/conversionActions/9001',
          name: 'XeroFlow qualified lead',
          status: 'ENABLED',
          type: 'UPLOAD_CLICKS',
          category: 'QUALIFIED_LEAD',
          origin: 'WEBSITE',
          isPrimary: false,
          includesInConversions: true,
          deliveryMode: 'offline_click'
        },
        {
          id: '9002',
          resourceName: 'customers/3584435581/conversionActions/9002',
          name: 'Website lead',
          status: 'ENABLED',
          type: 'WEBPAGE',
          category: 'SUBMIT_LEAD_FORM',
          origin: 'WEBSITE',
          isPrimary: true,
          includesInConversions: true,
          deliveryMode: 'additional_data_source'
        }
      ],
      pagination: { page: 1, pageSize: 50, hasNextPage: false }
    })
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
  })

  it('uses bounded page input and one look-ahead row for pagination', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      conversionAction: {
        resourceName: `customers/3584435581/conversionActions/${index + 1}`,
        id: String(index + 1),
        name: `Action ${index + 1}`,
        status: 'ENABLED',
        type: 'UPLOAD_CLICKS',
        category: 'QUALIFIED_LEAD',
        origin: 'WEBSITE',
        primaryForGoal: false,
        includeInConversionsMetric: true
      }
    }))
    const query = vi.fn().mockResolvedValue(rows)
    const discovery = createGoogleConversionActionDiscovery({ query })

    const result = await discovery.list({
      accountId: '3584435581',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      page: 2,
      pageSize: 10
    })

    expect(String(query.mock.calls[0]?.[3])).toMatch(/LIMIT 21/)
    expect(String(query.mock.calls[0]?.[3])).not.toContain('OFFSET')
    expect(result.items).toHaveLength(10)
    expect(result.items[0]?.id).toBe('11')
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, hasNextPage: true })
  })

  it('fails closed when Google returns a malformed action instead of rendering untrusted data', async () => {
    const discovery = createGoogleConversionActionDiscovery({
      query: vi.fn().mockResolvedValue([{ conversionAction: { id: '9001', name: '<script>' } }])
    })

    await expect(discovery.list({
      accountId: '3584435581',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      page: 1,
      pageSize: 50
    })).rejects.toEqual(expect.objectContaining<Partial<GoogleConversionActionDiscoveryError>>({
      code: 'GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID'
    }))
  })
})

describe('Google conversion-action mutation', () => {
  it('creates one enabled lead action through the scoped v23 mutate endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      results: [{ resourceName: 'customers/3892176492/conversionActions/91001' }]
    })
    const mutation = createGoogleConversionActionMutation({ fetch })

    const result = await mutation.create({
      accountId: '3892176492',
      accessToken: 'secret-access',
      developerToken: 'secret-developer',
      loginCustomerId: '5250473322',
      name: 'Stock Enquiry'
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v23/customers/3892176492/conversionActions:mutate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-access',
          'developer-token': 'secret-developer',
          'login-customer-id': '5250473322',
          'Content-Type': 'application/json'
        },
        body: {
          operations: [{
            create: {
              name: 'Stock Enquiry',
              type: 'UPLOAD_CLICKS',
              category: 'SUBMIT_LEAD_FORM',
              status: 'ENABLED',
              countingType: 'ONE_PER_CLICK'
            }
          }]
        }
      }
    )
    expect(result).toEqual({
      resourceName: 'customers/3892176492/conversionActions/91001'
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|access|developer/i)
  })
})

describe('Google conversion-action provisioning', () => {
  const compatibleRow = {
    conversionAction: {
      resourceName: 'customers/3892176492/conversionActions/91001',
      id: '91001',
      name: 'Stock Enquiry',
      status: 'ENABLED',
      type: 'UPLOAD_CLICKS',
      category: 'SUBMIT_LEAD_FORM',
      origin: 'WEBSITE',
      primaryForGoal: true,
      includeInConversionsMetric: true
    }
  }

  it('reuses an exact compatible action without mutating Google Ads', async () => {
    const query = vi.fn().mockResolvedValue([compatibleRow])
    const create = vi.fn()
    const provisioner = createGoogleConversionActionProvisioner({ query, create })

    const result = await provisioner.ensure({
      accountId: '3892176492',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      name: 'Stock Enquiry'
    })

    expect(create).not.toHaveBeenCalled()
    expect(String(query.mock.calls[0]?.[3])).toContain("conversion_action.name = 'Stock Enquiry'")
    expect(result).toMatchObject({ created: false, item: { id: '91001', name: 'Stock Enquiry' } })
  })

  it('creates a missing action once and reads back the exact compatible result', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([compatibleRow])
    const create = vi.fn().mockResolvedValue({
      resourceName: 'customers/3892176492/conversionActions/91001'
    })
    const provisioner = createGoogleConversionActionProvisioner({ query, create })

    const result = await provisioner.ensure({
      accountId: '3892176492',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: '5250473322',
      name: 'Stock Enquiry'
    })

    expect(create).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ created: true, item: { id: '91001', type: 'UPLOAD_CLICKS' } })
  })

  it('recovers idempotently when a concurrent creator wins the provider race', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([compatibleRow])
    const create = vi.fn().mockRejectedValue(new Error('provider duplicate name'))
    const provisioner = createGoogleConversionActionProvisioner({ query, create })

    const result = await provisioner.ensure({
      accountId: '3892176492',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      name: 'Stock Enquiry'
    })

    expect(result).toMatchObject({ created: false, item: { id: '91001', name: 'Stock Enquiry' } })
  })

  it('fails closed instead of reusing an exact incompatible action', async () => {
    const query = vi.fn().mockResolvedValue([{
      conversionAction: { ...compatibleRow.conversionAction, type: 'WEBPAGE' }
    }])
    const create = vi.fn()
    const provisioner = createGoogleConversionActionProvisioner({ query, create })

    await expect(provisioner.ensure({
      accountId: '3892176492',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      name: 'Stock Enquiry'
    })).rejects.toMatchObject({ code: 'GOOGLE_CONVERSION_ACTION_CONFLICT' })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects conversion names outside the approved Knox LDV allowlist', async () => {
    const provisioner = createGoogleConversionActionProvisioner({
      query: vi.fn(),
      create: vi.fn()
    })

    await expect(provisioner.ensure({
      accountId: '3892176492',
      accessToken: 'access',
      developerToken: 'developer',
      loginCustomerId: null,
      name: 'Any Other Conversion'
    } as never)).rejects.toMatchObject({ code: 'GOOGLE_CONVERSION_ACTION_INPUT_INVALID' })
  })
})
