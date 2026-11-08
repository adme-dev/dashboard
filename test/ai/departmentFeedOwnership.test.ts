import { describe, expect, it } from 'vitest'
import { isScopedDepartmentFeed } from '~~/server/utils/ai/marketing/departmentFeedOwnership'
import type { DealerLink, FeedDetail } from '~~/server/utils/feeds/types'

const link = { clientId: 'client', externalOrgId: 'dealer-org', sellerRefs: ['knox-ford-gwm'], defaultFeedIds: ['knox-meta'] } as DealerLink
const feed = { id: 'knox-meta', source: { type: 'meilisearch', url: 'https://search4.dealerstudio.com.au/multi-search', authCredentials: 'private', requestConfig: { indexUid: 'stock', filter: ['location_id = 2624'] } }, filters: { sellerIds: ['knox-ford-gwm'] } } as unknown as FeedDetail

describe('department bound supplier feed ownership', () => {
  it('admits the preconfigured Knox Ford supplier feed only through its explicit client binding', () => {
    expect(isScopedDepartmentFeed(feed, link)).toBe(true)
    expect(isScopedDepartmentFeed({ ...feed, id: 'other-feed' }, link)).toBe(false)
    expect(isScopedDepartmentFeed(feed, { ...link, defaultFeedIds: [] })).toBe(false)
  })
  it('never lets an explicit binding bypass seller scope or manual include guards', () => {
    for (const filters of [{}, { sellerIds: ['foreign'] }, { sellerIds: ['knox-ford-gwm', 'foreign'] }, { sellerIds: ['knox-ford-gwm'], includeIds: ['foreign'] }, { sellerIds: ['knox-ford-gwm'], manualIncludeIds: ['foreign'] }, { rulesets: [{ sellerId: 'knox-ford-gwm' }, { sellerId: '' }] }]) {
      expect(isScopedDepartmentFeed({ ...feed, filters }, link)).toBe(false)
    }
    expect(isScopedDepartmentFeed(feed, { ...link, externalOrgId: '' })).toBe(false)
  })
  it('keeps native feeds supported and excludes unknown supplier types', () => {
    expect(isScopedDepartmentFeed({ ...feed, id: 'native', source: { type: 'meilisearch' } }, link)).toBe(true)
    expect(isScopedDepartmentFeed({ ...feed, source: { type: 'csv', url: 'https://other.example' } }, link)).toBe(false)
    expect(isScopedDepartmentFeed({ ...feed, source: { type: 'meilisearch', url: 'https://foreign.example' } }, link)).toBe(false)
    expect(isScopedDepartmentFeed({ ...feed, source: { type: 'adtorque', baseUrl: 'https://dealer.example' } }, link)).toBe(true)
  })
})
