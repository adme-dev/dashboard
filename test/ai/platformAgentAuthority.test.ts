import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

describe('resolveUserPlatformAgentAuthority', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAuth.mockReset()
    mockGetSelectedTenant.mockReset()
    mockQueryRows.mockReset()
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValue({ tenant_id: 'tenant-a' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
  })

  it('derives an all-client allow-list for management from the database', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin', permissionGroups: [] })
    mockQueryRows.mockResolvedValue([{ id: 'client-b' }, { id: 'client-a' }])
    const { resolveUserPlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    const authority = await resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['MEDIA_BUYING'],
      tenant: 'required',
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM agency_clients')
    expect(mockQueryRows.mock.calls[0]?.[0]).not.toContain('client_team_assignments')
    expect(authority).toMatchObject({
      actor: { type: 'user', id: 'user-1' },
      tenantId: 'tenant-a',
      allowedClientIds: ['client-b', 'client-a'],
      source: 'authenticated_app',
    })
  })

  it('derives only assigned clients for a non-management specialist', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'user-2', role: 'media_buyer', permissionGroups: [] })
    mockQueryRows.mockResolvedValue([{ id: 'client-a' }])
    const { resolveUserPlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    const authority = await resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['MEDIA_BUYING'],
      tenant: 'none',
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('client_team_assignments')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['user-2'])
    expect(authority.tenantId).toBeNull()
    expect(authority.allowedClientIds).toEqual(['client-a'])
  })

  it('honors dynamic permission groups and denies unrelated users', async () => {
    const { resolveUserPlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')
    mockRequireAuth.mockResolvedValue({ id: 'user-3', role: 'custom', permissionGroups: ['FINANCE'] })
    mockQueryRows.mockResolvedValue([])

    await expect(resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['FINANCE'],
      tenant: 'required',
    })).resolves.toMatchObject({ actor: { id: 'user-3' } })

    mockRequireAuth.mockResolvedValue({ id: 'user-4', role: 'creative', permissionGroups: [] })
    await expect(resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['FINANCE'],
      tenant: 'required',
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('fails closed when a required tenant is unavailable', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin', permissionGroups: [] })
    mockGetSelectedTenant.mockResolvedValue(null)
    const { resolveUserPlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    await expect(resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['FINANCE'],
      tenant: 'required',
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('rejects a selected user tenant that is not a connected organization tenant', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin', permissionGroups: [] })
    mockQueryOne.mockResolvedValue(null)
    const { resolveUserPlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    await expect(resolveUserPlatformAgentAuthority({ context: {} } as any, {
      permissionGroups: ['FINANCE'],
      tenant: 'required',
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('derives service authority only for a connected tenant and active clients', async () => {
    mockQueryOne.mockResolvedValue({ tenant_id: 'tenant-a' })
    mockQueryRows.mockResolvedValue([{ id: 'client-a' }, { id: 'client-b' }])
    const { resolveServicePlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    const authority = await resolveServicePlatformAgentAuthority({
      serviceId: 'cloudflare-platform-agents',
      tenantId: 'tenant-a',
      tenant: 'required',
    })

    expect(mockQueryOne.mock.calls[0]?.[0]).toContain('FROM xero_org_connection')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual(['tenant-a'])
    expect(authority).toMatchObject({
      actor: { type: 'service', id: 'cloudflare-platform-agents' },
      tenantId: 'tenant-a',
      allowedClientIds: ['client-a', 'client-b'],
      source: 'authenticated_service',
    })
  })

  it('rejects service authority for an unconnected tenant', async () => {
    mockQueryOne.mockResolvedValue(null)
    const { resolveServicePlatformAgentAuthority } = await import('~~/server/utils/ai/platformAgentAuthority')

    await expect(resolveServicePlatformAgentAuthority({
      serviceId: 'cloudflare-platform-agents',
      tenantId: 'tenant-b',
      tenant: 'required',
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
