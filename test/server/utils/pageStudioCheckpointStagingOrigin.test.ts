import { describe, expect, it, vi } from 'vitest'
import { checkpointStagingOrigin, editorCheckpointStagingOrigin } from '~~/server/utils/pageStudio/checkpointStagingOrigin'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'

const native = { formatVersion: 1, environment: 'staging', source: 'native-login', role: 'agency',
  userId: '33333333-3333-4333-8333-333333333333', loginSessionHash: 'a'.repeat(64) }
const claims: PageStudioSessionClaims = { role: 'agency', userId: native.userId, nonce: 'editor_original_nonce',
  tenantId: 'tenant_a', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111',
  capabilities: ['workspace:checkpoint'], issuedAt: 100, expiresAt: 200 }

describe('internal checkpoint staging provenance', () => {
  it.each(['staging', 'production'])('retains an explicit %s environment', (environment) => {
    expect(checkpointStagingOrigin({ ...native, environment })).toEqual({ ...native, environment })
  })
  it.each([undefined, 'preview', ''])('omits unavailable environment %s without inventing a default', (environment) => {
    expect(checkpointStagingOrigin({ ...native, environment })).toBeNull()
  })
  it.each([
    { loginSessionHash: undefined }, { loginSessionHash: 'raw-credential' }, { role: 'service' },
    { source: 'studio-session' }, { source: 'provisioning' }, { token: 'must-never-be-retained' }
  ])('rejects incomplete or credential-bearing provenance %j', (overrides) => {
    expect(checkpointStagingOrigin({ ...native, ...overrides })).toBeNull()
  })
  it('selects the parent from the exact authorized child rather than caller-supplied claims', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ login_session_hash: native.loginSessionHash }] })
    const result = await editorCheckpointStagingOrigin({ query } as PageStudioControlQueryClient, claims, 'staging')
    expect(result).toEqual({ ...native, source: 'studio-session', nonce: claims.nonce })
    expect(query.mock.calls[0]![1]).toEqual([claims.nonce, claims.userId, claims.role, claims.tenantId, claims.clientId, claims.siteId])
  })
  it('does not query or create provenance when rollout environment is missing', async () => {
    const query = vi.fn()
    expect(await editorCheckpointStagingOrigin({ query } as PageStudioControlQueryClient, claims, undefined)).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })
  it('does not invent a parent login for a missing retained child', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await editorCheckpointStagingOrigin({ query } as PageStudioControlQueryClient, claims, 'staging')).toBeNull()
  })
})
