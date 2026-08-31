import { describe, expect, it, vi } from 'vitest'
import { mutateGoogleAds } from '~~/server/utils/googleAds/mutate'

const auth = {
  accessToken: 'access',
  developerToken: 'developer',
  loginCustomerId: '999-999-9999',
}

describe('mutateGoogleAds', () => {
  it('sends a validate-only mutation through an allowlisted service', async () => {
    const request = vi.fn().mockResolvedValue({
      data: { results: [] },
      requestId: 'request-1',
    })

    const result = await mutateGoogleAds({
      customerId: '123-456-7890',
      service: 'campaigns',
      auth,
      validateOnly: true,
      atomicity: 'interdependent',
      operations: [{ create: { name: 'Draft', status: 'PAUSED' } }],
    }, { request })

    expect(request).toHaveBeenCalledWith({
      path: '/customers/1234567890/campaigns:mutate',
      method: 'POST',
      auth,
      body: {
        operations: [{ create: { name: 'Draft', status: 'PAUSED' } }],
        partialFailure: false,
        validateOnly: true,
        responseContentType: 'MUTABLE_RESOURCE',
      },
      retries: 0,
      write: true,
    })
    expect(result).toEqual({
      results: [],
      partialFailureError: undefined,
      requestId: 'request-1',
    })
  })

  it('returns partial-failure details for independent operations', async () => {
    const partialFailureError = { code: 3, message: 'One operation failed' }
    const request = vi.fn().mockResolvedValue({
      data: { results: [{ resourceName: 'customers/1234567890/campaigns/1' }], partialFailureError },
      requestId: 'request-2',
    })

    await expect(mutateGoogleAds({
      customerId: '1234567890',
      service: 'campaigns',
      auth,
      validateOnly: false,
      atomicity: 'independent',
      partialFailure: true,
      operations: [{ update: { resourceName: 'customers/1234567890/campaigns/1', status: 'PAUSED' }, updateMask: 'status' }],
    }, { request })).resolves.toEqual({
      results: [{ resourceName: 'customers/1234567890/campaigns/1' }],
      partialFailureError,
      requestId: 'request-2',
    })
  })

  it('routes custom conversion goals through the v25 typed mutation service', async () => {
    const request = vi.fn().mockResolvedValue({ data: { results: [] } })
    await mutateGoogleAds({
      customerId: '1234567890',
      service: 'customConversionGoals',
      auth,
      validateOnly: true,
      atomicity: 'interdependent',
      operations: [{ create: {
        name: 'Qualified dealer leads',
        status: 'ENABLED',
        conversionActions: ['customers/1234567890/conversionActions/9001']
      } }]
    }, { request })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/customers/1234567890/customConversionGoals:mutate',
      write: true
    }))
  })

  it('routes campaign goal configs through the v25 typed mutation service', async () => {
    const request = vi.fn().mockResolvedValue({ data: { results: [] } })
    await mutateGoogleAds({
      customerId: '1234567890',
      service: 'conversionGoalCampaignConfigs',
      auth,
      validateOnly: true,
      atomicity: 'interdependent',
      operations: [{ update: {
        resourceName: 'customers/1234567890/conversionGoalCampaignConfigs/60',
        goalConfigLevel: 'CUSTOMER'
      }, updateMask: 'goal_config_level' }]
    }, { request })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/customers/1234567890/conversionGoalCampaignConfigs:mutate',
      write: true
    }))
  })

  it('rejects partial failure for interdependent operations', async () => {
    const request = vi.fn()

    await expect(mutateGoogleAds({
      customerId: '1234567890',
      service: 'campaigns',
      auth,
      validateOnly: false,
      atomicity: 'interdependent',
      partialFailure: true,
      operations: [{ update: { resourceName: 'customers/1234567890/campaigns/1', status: 'PAUSED' }, updateMask: 'status' }],
    }, { request })).rejects.toThrow('Partial failure is only allowed for independent operations')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects an unsupported provider service', async () => {
    const request = vi.fn()

    await expect(mutateGoogleAds({
      customerId: '1234567890',
      service: 'arbitraryHttp' as never,
      auth,
      validateOnly: true,
      atomicity: 'independent',
      operations: [{ create: { name: 'Draft' } }],
    }, { request })).rejects.toThrow('Unsupported Google Ads mutation service')
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    [[]],
    [[{ create: { name: 'A' }, remove: 'customers/1234567890/campaigns/1' }]],
    [[{ update: { resourceName: 'customers/1234567890/campaigns/1' } }]],
  ])('rejects an invalid operation batch: %j', async (operations) => {
    const request = vi.fn()

    await expect(mutateGoogleAds({
      customerId: '1234567890',
      service: 'campaigns',
      auth,
      validateOnly: true,
      atomicity: 'independent',
      operations: operations as never,
    }, { request })).rejects.toThrow('Invalid Google Ads mutation operations')
    expect(request).not.toHaveBeenCalled()
  })
})
