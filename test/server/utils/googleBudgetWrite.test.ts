import { describe, it, expect, vi, beforeEach } from 'vitest'
const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))
import { updateGoogleCampaignDailyBudget, getCampaignSpendById } from '~~/server/utils/googleAdsClient'

beforeEach(() => ofetchMock.mockReset())

describe('updateGoogleCampaignDailyBudget', () => {
  it('mutates amountMicros using REST JSON field names and sends MCC header', async () => {
    ofetchMock
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { resourceName: 'customers/123/campaignBudgets/9', amountMicros: '0' } }] }]) // searchStream resolve
      .mockResolvedValueOnce({ results: [{ resourceName: 'customers/123/campaignBudgets/9' }] }) // mutate
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { amountMicros: '120000000' } }] }]) // read-back
    const r = await updateGoogleCampaignDailyBudget({
      customerId: '123', campaignId: '555', dailyMajor: 120,
      token: 'tok', developerToken: 'dev', loginCustomerId: '5250473322',
    })
    expect(r.readBackDailyMajor).toBe(120)
    const mutateCall = ofetchMock.mock.calls[1]
    expect(mutateCall[1].headers['login-customer-id']).toBe('5250473322')
    expect(mutateCall[1].body).toEqual({
      operations: [{
        updateMask: 'amountMicros',
        update: {
          resourceName: 'customers/123/campaignBudgets/9',
          amountMicros: '120000000',
        },
      }],
    })
  })

  it('retries WITHOUT the manager header when a manager context 403s (directly-owned account)', async () => {
    const err403: any = new Error('permission denied')
    err403.status = 403
    ofetchMock
      .mockRejectedValueOnce(err403) // attempt 1 (with MCC): resolve budget → 403
      // attempt 2 (no MCC): resolve → mutate → read-back
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { resourceName: 'customers/123/campaignBudgets/9' } }] }])
      .mockResolvedValueOnce({ results: [{ resourceName: 'customers/123/campaignBudgets/9' }] })
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { amountMicros: '90000000' } }] }])

    const r = await updateGoogleCampaignDailyBudget({
      customerId: '123', campaignId: '555', dailyMajor: 90,
      token: 'tok', developerToken: 'dev', loginCustomerId: '5250473322',
    })
    expect(r.readBackDailyMajor).toBe(90)
    // The retry must drop the login-customer-id header.
    const retryResolveCall = ofetchMock.mock.calls[1]
    expect(retryResolveCall[1].headers['login-customer-id']).toBeUndefined()
  })

  it('does NOT retry on 403 when no manager header was sent (re-throws)', async () => {
    const err403: any = new Error('permission denied')
    err403.status = 403
    ofetchMock.mockRejectedValueOnce(err403)
    await expect(updateGoogleCampaignDailyBudget({
      customerId: '123', campaignId: '555', dailyMajor: 90,
      token: 'tok', developerToken: 'dev', loginCustomerId: undefined,
    })).rejects.toThrow()
    expect(ofetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces structured Google mutation diagnostics without request credentials', async () => {
    const invalidArgument: any = new Error('400 Bad Request')
    invalidArgument.status = 400
    invalidArgument.data = {
      error: {
        message: 'Request contains an invalid argument.',
        details: [{
          errors: [{
            errorCode: { fieldMaskError: 'FIELD_NOT_FOUND' },
            message: 'The field mask is invalid.',
            location: { fieldPathElements: [{ fieldName: 'operations', index: 0 }, { fieldName: 'updateMask' }] },
          }],
        }],
      },
    }
    ofetchMock
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { resourceName: 'customers/123/campaignBudgets/9' } }] }])
      .mockRejectedValueOnce(invalidArgument)

    let thrown: unknown
    try {
      await updateGoogleCampaignDailyBudget({
        customerId: '123', campaignId: '555', dailyMajor: 90,
        token: 'secret-access-token', developerToken: 'secret-developer-token', loginCustomerId: '5250473322',
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('Google Ads budget update rejected: FIELD_NOT_FOUND at operations[0].updateMask — The field mask is invalid.')
    expect((thrown as Error).message).not.toContain('secret')
  })
})

describe('getCampaignSpendById', () => {
  it('aggregates cost/impressions/clicks across day-segment rows', async () => {
    ofetchMock.mockResolvedValueOnce([{ results: [
      { metrics: { costMicros: '1500000', impressions: '100', clicks: '5' } },
      { metrics: { costMicros: '2500000', impressions: '200', clicks: '7' } },
    ] }])
    const r = await getCampaignSpendById('123', 'tok', 'dev', '555', 6, 2026, '5250473322')
    expect(r).toEqual({ spend: 4, impressions: 300, clicks: 12 })
  })

  it('returns null when the campaign has no rows in the window', async () => {
    ofetchMock.mockResolvedValueOnce([{ results: [] }])
    const r = await getCampaignSpendById('123', 'tok', 'dev', '555', 6, 2026)
    expect(r).toBeNull()
  })

  it('returns null for a non-numeric campaign id without calling the API', async () => {
    const r = await getCampaignSpendById('123', 'tok', 'dev', 'abc', 6, 2026)
    expect(r).toBeNull()
    expect(ofetchMock).not.toHaveBeenCalled()
  })
})
