import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireRole = vi.fn()
const transaction = vi.fn()
const query = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole }))
vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: { MANAGEMENT: ['owner', 'admin'] }
}))
vi.mock('~~/server/utils/db', () => ({ transaction }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: () => string
  readBody: () => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = () => 'client-1'
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const { default: handler } = await import(
  '../../../../server/api/agency/clients/[id]/crm-settings.put'
)

describe('agency client CRM settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'client-1' }] })
    transaction.mockImplementation(async callback => callback({ query }))
  })

  it('updates the agency-controlled mode and both entitlement gates', async () => {
    testGlobal.readBody = async () => ({
      leadCaptureMode: 'full_crm',
      crmCoreStatus: 'active',
      crmExternalStatus: 'suspended'
    })

    const result = await handler({} as never)

    expect(result).toMatchObject({
      ok: true,
      leadCaptureMode: 'full_crm',
      policy: { promoteInternally: true }
    })
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET lead_capture_mode = $2'),
      ['client-1', 'full_crm']
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_feature_entitlements'),
      ['client-1', 'crm.core', 'active']
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_feature_entitlements'),
      ['client-1', 'crm.external', 'suspended']
    )
  })

  it('rejects modes outside the server-owned contract', async () => {
    testGlobal.readBody = async () => ({
      leadCaptureMode: 'provider_requested_crm',
      crmCoreStatus: 'active',
      crmExternalStatus: 'active'
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid lead capture mode'
    })
    expect(transaction).not.toHaveBeenCalled()
  })
})
