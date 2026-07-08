import { describe, expect, it, vi } from 'vitest'
import {
  deactivateDealerLink,
  listDealerLinks,
  normalizeDealerLinkInput,
  upsertDealerLink,
} from '~~/server/utils/feeds/dealerLinkStore'

const row = {
  id: 'link-1',
  client_id: '11111111-1111-4111-8111-111111111111',
  client_name: 'Springvale Kia',
  provider_id: 'social-dashboard',
  external_org_id: '22222222-2222-4222-8222-222222222222',
  seller_refs: ['kia-springvale'],
  default_feed_ids: ['feed-1'],
  status: 'active',
  created_at: '2026-07-09T00:00:00.000Z',
  updated_at: '2026-07-09T00:00:00.000Z',
}

describe('normalizeDealerLinkInput', () => {
  it('defaults the provider and cleans array fields', () => {
    expect(normalizeDealerLinkInput({
      clientId: row.client_id,
      externalOrgId: row.external_org_id,
      sellerRefs: [' kia-springvale ', '', 'kia-springvale', 123],
      defaultFeedIds: [' feed-1 ', null, 'feed-1'],
    })).toEqual({
      clientId: row.client_id,
      providerId: 'social-dashboard',
      externalOrgId: row.external_org_id,
      sellerRefs: ['kia-springvale', '123'],
      defaultFeedIds: ['feed-1'],
      status: 'active',
    })
  })

  it('rejects missing required identifiers', () => {
    expect(() => normalizeDealerLinkInput({ clientId: '', externalOrgId: 'org' })).toThrow(/clientId/)
    expect(() => normalizeDealerLinkInput({ clientId: row.client_id, externalOrgId: '' })).toThrow(/externalOrgId/)
  })
})

describe('listDealerLinks', () => {
  it('returns mapped rows scoped to active social-dashboard links by default', async () => {
    const queryRows = vi.fn(async () => [row])

    await expect(listDealerLinks({ queryRows: queryRows as any })).resolves.toEqual([{
      id: 'link-1',
      clientId: row.client_id,
      clientName: 'Springvale Kia',
      providerId: 'social-dashboard',
      externalOrgId: row.external_org_id,
      sellerRefs: ['kia-springvale'],
      defaultFeedIds: ['feed-1'],
      status: 'active',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }])
    expect(queryRows).toHaveBeenCalledWith(expect.stringContaining('client_feed_links'), ['social-dashboard', 'active'])
  })
})

describe('upsertDealerLink', () => {
  it('requires the agency client to exist before writing a link', async () => {
    const queryOne = vi.fn(async () => null)

    await expect(upsertDealerLink({
      clientId: row.client_id,
      externalOrgId: row.external_org_id,
    }, { queryOne: queryOne as any })).rejects.toThrow(/agency client not found/i)
  })

  it('upserts one link per client/provider and returns the mapped row', async () => {
    const queryOne = vi.fn(async (sql: string) => sql.includes('SELECT id FROM agency_clients')
      ? { id: row.client_id }
      : row)

    await expect(upsertDealerLink({
      clientId: row.client_id,
      externalOrgId: row.external_org_id,
      sellerRefs: ['kia-springvale'],
      defaultFeedIds: ['feed-1'],
    }, { queryOne: queryOne as any, actorId: 'user-1' })).resolves.toMatchObject({
      clientId: row.client_id,
      externalOrgId: row.external_org_id,
      sellerRefs: ['kia-springvale'],
      defaultFeedIds: ['feed-1'],
      status: 'active',
    })

    expect(queryOne).toHaveBeenLastCalledWith(expect.stringContaining('ON CONFLICT (client_id, provider_id) DO UPDATE'), [
      row.client_id,
      'social-dashboard',
      row.external_org_id,
      '["kia-springvale"]',
      '["feed-1"]',
      'active',
      'user-1',
    ])
  })
})

describe('deactivateDealerLink', () => {
  it('soft-deletes a mapping by client and provider', async () => {
    const queryOne = vi.fn(async () => ({ ...row, status: 'inactive' }))

    await expect(deactivateDealerLink(row.client_id, { queryOne: queryOne as any })).resolves.toMatchObject({
      clientId: row.client_id,
      status: 'inactive',
    })
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("status = 'inactive'"), [row.client_id, 'social-dashboard'])
  })
})
