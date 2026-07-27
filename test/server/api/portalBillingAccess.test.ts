import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  setHeader: (event: unknown, name: string, value: string) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.setHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockGetClientBillingOverview = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/billing/operations', () => ({
  getClientBillingOverview: (...args: unknown[]) => mockGetClientBillingOverview(...args)
}))

const { default: billingHandler } = await import('../../../../server/api/portal/billing.get')

describe('portal billing access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientBillingOverview.mockResolvedValue({ invoices: [] })
  })

  it('rejects invoice-restricted users before reading billing data', async () => {
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'client-1',
      permissions: { canViewInvoices: false }
    })

    await expect(billingHandler({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'You do not have permission to view invoices'
    })
    expect(mockGetClientBillingOverview).not.toHaveBeenCalled()
  })

  it('returns billing data without enabling browser reuse for an authorised user', async () => {
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'client-1',
      permissions: { canViewInvoices: true }
    })

    await expect(billingHandler({})).resolves.toEqual({ invoices: [] })
    expect(mockGetClientBillingOverview).toHaveBeenCalledWith('client-1')
    expect(testGlobal.setHeader).toHaveBeenCalledWith({}, 'Cache-Control', 'private, no-store')
  })
})
