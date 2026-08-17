import { describe, expect, it, vi } from 'vitest'
import { requireAllCrmRecordsAccess } from '../../workers/leads-delivery-worker/src/crm/recordAccess'
import type { TrustedCrmSystemContext } from '../../workers/leads-delivery-worker/src/crm/searchContext'

const dbMocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn()
}))

vi.mock('../../workers/leads-delivery-worker/src/db', () => dbMocks)

const { resolveTrustedCrmSystemContext } = await import(
  '../../workers/leads-delivery-worker/src/crm/searchContext'
)

const context: TrustedCrmSystemContext = {
  organisationScopeId: 'scope-1',
  clientId: 'client-a',
  correlationId: 'correlation-1',
  actorType: 'system',
  actorId: 'trusted-system:lead_crm_promotion',
  surface: 'trusted_system',
  permissionSet: [],
  visibility: { ownerScoped: false },
  trustedSystem: { purpose: 'lead_crm_promotion' }
}

describe('leads delivery Worker CRM authorization', () => {
  it('resolves only an active client with one primary organisation scope', async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: 'client-a' })
    dbMocks.queryRows.mockResolvedValueOnce([{ id: 'scope-1' }])

    const resolved = await resolveTrustedCrmSystemContext({
      clientId: 'client-a',
      purpose: 'lead_crm_promotion'
    })

    expect(resolved).toMatchObject({
      clientId: 'client-a',
      organisationScopeId: 'scope-1',
      actorType: 'system',
      trustedSystem: { purpose: 'lead_crm_promotion' }
    })
  })

  it('fails closed when the organisation scope is ambiguous', async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: 'client-a' })
    dbMocks.queryRows.mockResolvedValueOnce([{ id: 'scope-1' }, { id: 'scope-2' }])

    await expect(resolveTrustedCrmSystemContext({
      clientId: 'client-a',
      purpose: 'lead_crm_promotion'
    })).rejects.toThrow('Trusted CRM organisation scope is unavailable')
  })

  it('locks promotion records inside the current tenant', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'person-1', client_id: 'client-a' }]
    })

    const records = await requireAllCrmRecordsAccess(
      context,
      [{ type: 'person', id: 'person-1' }],
      { query }
    )

    expect(records).toHaveLength(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('client_id = $2'),
      ['person-1', 'client-a']
    )
  })

  it('fails closed when a record is outside the current tenant', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })

    await expect(requireAllCrmRecordsAccess(
      context,
      [{ type: 'opportunity', id: 'opportunity-b' }],
      { query }
    )).rejects.toThrow('CRM promotion record is unavailable')
  })

  it('rejects record types outside the lead-promotion surface', async () => {
    const query = vi.fn()

    await expect(requireAllCrmRecordsAccess(
      context,
      [{ type: 'company', id: 'company-1' }],
      { query }
    )).rejects.toThrow('Unsupported CRM promotion record type')
    expect(query).not.toHaveBeenCalled()
  })
})
