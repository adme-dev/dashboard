import { describe, it, expect, vi, beforeEach } from 'vitest'
const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))
import { updateGoogleCampaignDailyBudget } from '~~/server/utils/googleAdsClient'

beforeEach(() => ofetchMock.mockReset())

describe('updateGoogleCampaignDailyBudget', () => {
  it('mutates amount_micros and sends MCC header', async () => {
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
    expect(JSON.stringify(mutateCall[1].body)).toContain('amount_micros')
    expect(JSON.stringify(mutateCall[1].body)).toContain('120000000')
  })
})
