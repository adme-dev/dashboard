import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireClientCatalogAccess } from '~~/server/utils/crm/clientCatalogAccess'

const { requireClientAuth } = vi.hoisted(() => ({
  requireClientAuth: vi.fn()
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args)
}))

const event = {} as Parameters<typeof requireClientCatalogAccess>[0]

function client(overrides: Partial<{
  isPrimaryContact: boolean
  canAdminCrm: boolean
  canInviteUsers: boolean
  leadCaptureMode: 'full_crm' | 'capture_only'
}> = {}) {
  const {
    isPrimaryContact = false,
    canAdminCrm = false,
    canInviteUsers = false,
    leadCaptureMode = 'full_crm'
  } = overrides
  return {
    id: '33333333-3333-4333-8333-333333333333',
    clientId: '11111111-1111-4111-8111-111111111111',
    leadCaptureMode,
    isPrimaryContact,
    permissions: {
      canAdminCrm,
      canInviteUsers
    }
  }
}

describe('client catalog access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('leaves read access unchanged for authenticated full-CRM users', async () => {
    const authenticated = client()
    requireClientAuth.mockResolvedValue(authenticated)

    await expect(requireClientCatalogAccess(event)).resolves.toBe(authenticated)
  })

  it.each([
    ['a primary contact', client({ isPrimaryContact: true })],
    ['a CRM administrator', client({ canAdminCrm: true })]
  ])('allows %s to manage catalog sources', async (_label, authenticated) => {
    requireClientAuth.mockResolvedValue(authenticated)

    await expect(requireClientCatalogAccess(event, true)).resolves.toBe(authenticated)
  })

  it('rejects invitation-only users from catalog mutations', async () => {
    requireClientAuth.mockResolvedValue(client({ canInviteUsers: true }))

    await expect(requireClientCatalogAccess(event, true)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Client administrator access is required'
    })
  })
})
