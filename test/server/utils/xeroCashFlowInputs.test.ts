import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bank: vi.fn(),
  receivables: vi.fn(),
  payables: vi.fn(),
  expenses: vi.fn()
}))

vi.mock('~~/server/utils/xeroDataFetcher', () => ({
  fetchBankSummary: mocks.bank,
  fetchReceivables: mocks.receivables,
  fetchPayables: mocks.payables,
  fetchRecentPaidExpenses: mocks.expenses
}))

const { fetchCashFlowInputs } = await import('~~/server/utils/xeroCashFlowInputs')

describe('fetchCashFlowInputs', () => {
  it('caps one forecast request at two concurrent Xero calls', async () => {
    let active = 0
    let maxActive = 0
    const tracked = (value: string) => async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return value
    }

    mocks.bank.mockImplementation(tracked('bank'))
    mocks.receivables.mockImplementation(tracked('receivables'))
    mocks.payables.mockImplementation(tracked('payables'))
    mocks.expenses.mockImplementation(tracked('expenses'))

    await expect(fetchCashFlowInputs('token', 'tenant')).resolves.toEqual([
      'bank',
      'receivables',
      'payables',
      'expenses'
    ])
    expect(maxActive).toBe(2)
  })
})
