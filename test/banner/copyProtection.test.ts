import { describe, expect, it } from 'vitest'
import { isProtectedBannerCopy, isSafeBannerRewrite } from '../../shared/bannerCopyProtection'

describe('Conservative copy screening alongside explicit approved-block locks', () => {
  it.each(['Private buyers only', 'Eligible customers only', 'Eligibility applies', 'Ends Sunday', 'Hello {{first_name}}', 'Hello ${first_name}', 'Free servicing for life', 'Five hundred dollars off', 'Visit Maroondah Highway'])('screens %s from creative rewriting', (text) => {
    expect(isProtectedBannerCopy(text)).toBe(true)
    expect(isSafeBannerRewrite('Welcome home', text)).toBe(false)
  })
  it('keeps creative headings available and explicit locks authoritative', () => {
    expect(isSafeBannerRewrite('WE’VE MOVED.', 'WELCOME TO OUR NEW HOME.')).toBe(true)
    expect(isSafeBannerRewrite('Approved words', 'Different words', true)).toBe(false)
  })
})
