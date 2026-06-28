import { describe, it, expect, vi } from 'vitest'
import { rowToDealerLink, getDealerLink } from '~~/server/utils/feeds/dealerLinks'

const row = {
  client_id: 'c1', provider_id: 'social-dashboard', external_org_id: 'org-9',
  seller_refs: ['kia-springvale', 'kia-frankston'], default_feed_ids: ['f1'],
}

describe('rowToDealerLink', () => {
  it('maps a DB row to a DealerLink', () => {
    expect(rowToDealerLink(row)).toEqual({
      clientId: 'c1', providerId: 'social-dashboard', externalOrgId: 'org-9',
      sellerRefs: ['kia-springvale', 'kia-frankston'], defaultFeedIds: ['f1'],
    })
  })
  it('coerces null jsonb arrays to []', () => {
    const l = rowToDealerLink({ ...row, seller_refs: null, default_feed_ids: null })
    expect(l.sellerRefs).toEqual([]); expect(l.defaultFeedIds).toEqual([])
  })
})

describe('getDealerLink', () => {
  it('returns null when no row', async () => {
    const queryOne = vi.fn(async () => null)
    expect(await getDealerLink('c1', 'social-dashboard', { queryOne: queryOne as any })).toBeNull()
  })
  it('maps the row and passes clientId + providerId as params', async () => {
    const queryOne = vi.fn(async () => row)
    const out = await getDealerLink('c1', 'social-dashboard', { queryOne: queryOne as any })
    expect(out?.externalOrgId).toBe('org-9')
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('client_feed_links'), ['c1', 'social-dashboard'])
  })
})
