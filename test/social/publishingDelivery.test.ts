import { describe, expect, it } from 'vitest'
import { publishingDelivery } from '../../server/utils/socialPublishing/deliveryReceipt'
const receipt = { accountId: 'a', platform: 'facebook', platformAccountId: 'page', platformPostId: 'post', status: 'success' }
const post = () => ({ status: 'published', published_at: '2026-10-03T15:00:00Z', account_ids: ['a'], platforms: ['facebook'], platform_results: { facebook: { ...receipt } } })
describe('linked task delivery evidence', () => {
  it('confirms delivery from a matching provider receipt', () => expect(publishingDelivery(post())).toMatchObject({ state: 'confirmed', total: 1, confirmed: 1 }))
  it.each([{ status: 'failed' }, { accountId: 'foreign' }, { platform: 'instagram' }, { platformPostId: '' }, { platformAccountId: '' }])('rejects incomplete or foreign receipt %j', patch => {
    expect(publishingDelivery({ ...post(), platform_results: { facebook: { ...receipt, ...patch } } }).state).toBe('unverified')
  })
  it('does not infer delivery from published status alone', () => expect(publishingDelivery({ status: 'published' }).state).toBe('unverified'))
  it('shows partial success across multiple targets', () => expect(publishingDelivery({ ...post(), account_ids: ['a', 'b'] })).toMatchObject({ state: 'partial', confirmed: 1, total: 2 }))
  it('keeps drafts pending', () => expect(publishingDelivery({ status: 'draft' }).state).toBe('pending'))
  it('does not count duplicate receipts as confirmed delivery', () => expect(publishingDelivery({ ...post(), platform_results: { one: receipt, two: receipt } }).state).toBe('unverified'))
  it('retains historic delivery but identifies recorded removal', () => expect(publishingDelivery({ ...post(), metadata: { liveFacebook: { a: { removed: true } } } })).toMatchObject({ state: 'confirmed', removed: 1 }))
})
