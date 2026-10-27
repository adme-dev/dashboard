import { describe, expect, it } from 'vitest'
import { socialCapabilityReadiness, providerAccountOperationEligibility } from '~~/server/utils/socialPublishing/capabilityReadiness'
import { platformPublishingSupport } from '~~/shared/socialCapabilityReadiness'

const staff = { clientMapped: true, socialDraft: true, reporting: true, signedRead: true, signedWrite: true }
const account = { platform: 'linkedin', isActive: true, metadata: { grantedScopes: ['w_organization_social', 'r_organization_social'] } }
const state = (a = account, s = staff) => Object.fromEntries(socialCapabilityReadiness(a, s).map(row => [row.operation, row]))
describe('staff operation readiness', () => {
  it('separates provider code from offered staff operations', () => {
    const r = state()
    expect(r.organic_publish!.state).toBe('available')
    expect(r.organic_comment).toMatchObject({ providerState: 'available', state: 'unsupported' })
    expect(r.inbox_read!.state).toBe('unsupported')
    expect(r.paid_mutation!.state).toBe('unsupported')
    expect(r.paid_reporting!.state).toBe('external_blocked')
  })
  it.each(['clientMapped', 'socialDraft', 'signedRead', 'signedWrite'] as const)('fails closed on %s', (key) => {
    expect(state(account, { ...staff, [key]: false }).organic_publish!.state).toBe('external_blocked')
  })
  it('does not offer a browser-only provider as a staff publishing operation', () => {
    expect(state({ ...account, platform: 'google-business' }).organic_publish!.state).toBe('unsupported')
  })
  it('does not claim Google Business metrics or arbitrary post comments from review-reply code', () => {
    const rows = state({ ...account, platform: 'google-business', metadata: { grantedScopes: ['read_insights'] } })
    expect(rows.organic_reporting).toMatchObject({ providerState: 'code_incomplete', state: 'code_incomplete' })
    expect(rows.organic_comment!.providerState).toBe('unsupported')
  })
  it('requires the actual provider scope and active account', () => {
    expect(state({ ...account, metadata: { grantedScopes: [] } }).organic_publish!.state).toBe('external_blocked')
    expect(state({ ...account, isActive: false }).organic_publish!.state).toBe('external_blocked')
  })
  it('never makes TikTok ready from code, scopes or healthy tokens', () => {
    expect(platformPublishingSupport('tiktok').productionReady).toBe(false)
    expect(state({ ...account, platform: 'tiktok' }).organic_publish).toMatchObject({ state: 'external_blocked', providerState: 'external_blocked' })
  })
  it.each([false, true])('never lets webhook subscription %s mask a missing linked Page', (webhook_subscribed) => {
    const linked = { platform: 'instagram', isActive: true, metadata: { via_page_id: 'page', webhook_subscribed, grantedScopes: ['instagram_content_publish'] } }
    expect(providerAccountOperationEligibility(linked, 'organic_publish').state).toBe('external_blocked')
    expect(providerAccountOperationEligibility({ ...linked, linkedFacebookAccountId: 'same-client-page', linkedFacebookIsActive: true }, 'organic_publish').state).toBe('available')
    expect(socialCapabilityReadiness(linked, staff).find(row => row.operation === 'organic_publish')!.state).toBe('external_blocked')
  })
})
