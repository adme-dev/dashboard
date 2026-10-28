/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous mock fixtures */
import { describe, expect, it } from 'vitest'
import { departmentProductFilter, isExactNativeFeedScope } from '~~/server/utils/ai/marketing/departmentCatalogSchemas'
import { departmentCatalogTools, executeDepartmentCatalogTool } from '~~/server/utils/ai/mcp/departmentCatalogTools'

const link: any = { clientId: 'client', externalOrgId: 'org', sellerRefs: ['seller-1'] }
const feed: any = { source: { type: 'meilisearch' }, filters: { sellerIds: ['seller-1'] } }
describe('exact native catalog ownership', () => {
  it('requires native source and nonempty owned seller scope', () => {
    expect(isExactNativeFeedScope(feed, link)).toBe(true)
    for (const filters of [{}, { sellerIds: ['seller-2'] }, { sellerIds: ['seller-1'], manualIncludeIds: ['foreign'] }, { rulesets: [{ sellerId: '' }] }]) expect(isExactNativeFeedScope({ ...feed, filters }, link)).toBe(false)
    expect(isExactNativeFeedScope({ ...feed, source: { type: 'csv', url: 'https://foreign.example' } }, link)).toBe(false)
    expect(isExactNativeFeedScope({ ...feed, source: { type: 'meilisearch', url: 'https://foreign.example' } }, link)).toBe(false)
  })
  it('requires every ruleset seller to be owned', () => {
    expect(isExactNativeFeedScope({ ...feed, filters: { rulesets: [{ sellerId: 'seller-1' }] } }, link)).toBe(true)
    expect(isExactNativeFeedScope({ ...feed, filters: { rulesets: [{ sellerId: 'seller-1' }, { sellerId: 'foreign' }] } }, link)).toBe(false)
  })
  it('rejects unverified price filters rather than implying currency-aware vehicle targeting', () => {
    expect(departmentProductFilter.safeParse({ clauses: [{ field: 'price', operator: 'gt', value: 30000 }] }).success).toBe(false)
  })
  it('rejects arbitrary provider fields and direct write handlers', async () => {
    const tool = departmentCatalogTools.find(t => t.name === 'marketing_propose_product_set_change')!
    expect(tool.parameters.safeParse({ clientId: '11111111-1111-4111-8111-111111111111', connectionId: '22222222-2222-4222-8222-222222222222', catalogId: '123456', sourceFeedId: '33333333-3333-4333-8333-333333333333', productSetId: '234567', filter: { url: 'http://localhost' } }).success).toBe(false)
    expect((await tool.handler({}, {} as any)).code).toBe('coordinator_required')
    expect((await executeDepartmentCatalogTool('arbitrary', {}, {} as any)).code).toBe('not_found')
  })
})
