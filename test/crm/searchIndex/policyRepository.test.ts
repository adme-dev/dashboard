import { describe, expect, it, vi } from 'vitest'
import {
  loadCrmSearchPolicySnapshot,
  requireCrmSearchProviderAuthority
} from '~~/server/utils/crm/searchIndex/policyRepository'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const validRow = {
  organisation_scope_id: organisationScopeId,
  client_id: clientId,
  global_state: 'enabled',
  maximum_mode: 'assist',
  indexing_ready: true,
  control_revision: '7',
  lifecycle_state: 'shadow',
  effective_mode: 'shadow',
  indexing_enabled: true,
  policy_revision: '11',
  active_schema_version: 'crm-search-v1',
  candidate_schema_version: null,
  retiring_schema_versions: [],
  schema_metadata_index_state: 'ready',
  schema_sentinel_state: 'confirmed_absent',
  rate_card_id: '33333333-3333-4333-8333-333333333333',
  rate_card_revision: 'cloudflare-2026-08-09',
  rate_card_model_id: '@cf/baai/bge-base-en-v1.5',
  rate_card_valid_from: '2026-08-09T00:00:00.000Z',
  rate_card_valid_until: '2027-08-09T00:00:00.000Z',
  rate_card_revoked_at: null
}

describe('CRM search policy repository', () => {
  it('uses a fresh direct read and resolves the most restrictive surface mode', async () => {
    const queryOneFresh = vi.fn().mockResolvedValue(validRow)
    const result = await loadCrmSearchPolicySnapshot({
      organisationScopeId,
      clientId,
      surface: 'agency_global',
      infrastructureReady: true,
      now: '2026-08-10T00:00:00.000Z'
    }, { queryOneFresh } as never)

    expect(result).toMatchObject({
      effectiveMode: 'shadow',
      globalState: 'enabled',
      controlRevision: 7,
      policyRevision: 11,
      activeSchemaVersion: 'crm-search-v1'
    })
    expect(queryOneFresh).toHaveBeenCalledOnce()
    expect(queryOneFresh.mock.calls[0]?.[0]).toContain('crm_search_global_control')
    expect(queryOneFresh.mock.calls[0]?.[0]).toContain('$3::TIMESTAMPTZ')
  })

  it.each([
    null,
    { ...validRow, global_state: 'unknown' },
    { ...validRow, control_revision: 'not-an-integer' },
    { ...validRow, client_id: '99999999-9999-4999-8999-999999999999' },
    { ...validRow, rate_card_model_id: '@cf/unsupported/model' },
    { ...validRow, rate_card_revoked_at: '2026-08-10T00:00:00.000Z' },
    { ...validRow, schema_sentinel_state: 'pending' }
  ])('fails closed to off for missing or malformed authority evidence', async (row) => {
    const result = await loadCrmSearchPolicySnapshot({
      organisationScopeId,
      clientId,
      surface: 'agency_ai',
      infrastructureReady: true,
      now: '2026-08-10T00:00:00.000Z'
    }, { queryOneFresh: vi.fn().mockResolvedValue(row) } as never)

    expect(result.effectiveMode).toBe('off')
    expect(result.providerEnabled).toBe(false)
  })

  it('locks global control and policy and stamps their exact revisions before upsert admission', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        state: 'enabled', indexing_ready: true, revision: '7'
      }] })
      .mockResolvedValueOnce({ rows: [{
        lifecycle_state: 'indexing', indexing_enabled: true, revision: '11',
        active_schema_version: 'crm-search-v1', candidate_schema_version: null,
        retiring_schema_versions: []
      }] })
      .mockResolvedValueOnce({ rows: [{
        metadata_index_state: 'ready', sentinel_state: 'confirmed_absent'
      }] })

    await expect(requireCrmSearchProviderAuthority({
      organisationScopeId,
      clientId,
      action: 'upsert',
      schemaVersion: 'crm-search-v1',
      infrastructureReady: true
    }, { query } as never)).resolves.toEqual({
      controlRevision: 7,
      policyRevision: 11,
      schemaRole: 'active',
      teardownId: null
    })

    expect(query.mock.calls[0]?.[0]).toContain('FOR SHARE')
    expect(query.mock.calls[1]?.[0]).toContain('FOR SHARE')
  })

  it('denies upserts after a control flip or when any authority row is missing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await expect(requireCrmSearchProviderAuthority({
      organisationScopeId,
      clientId,
      action: 'upsert',
      schemaVersion: 'crm-search-v1',
      infrastructureReady: true
    }, { query } as never)).rejects.toThrow('crm_search_provider_disabled')
  })

  it('does not make an authorized privacy delete depend on sentinel query readiness', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ state: 'enabled', indexing_ready: true, revision: '7' }] })
      .mockResolvedValueOnce({ rows: [{
        lifecycle_state: 'shadow', indexing_enabled: true, revision: '11',
        active_schema_version: 'crm-search-v1', candidate_schema_version: null,
        retiring_schema_versions: []
      }] })
      .mockResolvedValueOnce({ rows: [{ metadata_index_state: 'pending', sentinel_state: 'pending' }] })
    await expect(requireCrmSearchProviderAuthority({
      organisationScopeId,
      clientId,
      action: 'delete',
      schemaVersion: 'crm-search-v1',
      infrastructureReady: true
    }, { query } as never)).resolves.toMatchObject({ schemaRole: 'active' })
  })

  it('authorizes delete-only work from an independent teardown snapshot without a policy row', async () => {
    const teardownId = '44444444-4444-4444-8444-444444444444'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ state: 'delete_only', indexing_ready: false, revision: '9' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: teardownId, state: 'deleting', provider_deletion_state: 'pending'
      }] })

    await expect(requireCrmSearchProviderAuthority({
      organisationScopeId,
      clientId,
      action: 'delete',
      schemaVersion: 'crm-search-v1',
      infrastructureReady: true,
      teardownId
    }, { query } as never)).resolves.toEqual({
      controlRevision: 9,
      policyRevision: null,
      schemaRole: 'retiring',
      teardownId
    })
  })

  it('continues an independently authorized partially confirmed teardown deletion', async () => {
    const teardownId = '44444444-4444-4444-8444-444444444444'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ state: 'delete_only', indexing_ready: false, revision: '9' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: teardownId, state: 'provider_pending', provider_deletion_state: 'partially_confirmed'
      }] })

    await expect(requireCrmSearchProviderAuthority({
      organisationScopeId,
      clientId,
      action: 'delete',
      schemaVersion: 'crm-search-v1',
      infrastructureReady: true,
      teardownId
    }, { query } as never)).resolves.toMatchObject({ teardownId, schemaRole: 'retiring' })
  })
})
