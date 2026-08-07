import { describe, expect, it } from 'vitest'
import { buildPublicSendVerificationUrl } from '../../server/utils/send/publicEmail'

describe('public Send verification email links', () => {
  it('keeps every bearer capability in the fragment rather than the request URL', () => {
    const link = buildPublicSendVerificationUrl('https://app.xeroflow.io/', {
      transferId: '44444444-4444-4444-8444-444444444444',
      verificationToken: 'v'.repeat(43),
      managementToken: 'm'.repeat(43)
    })
    const url = new URL(link)

    expect(url.origin + url.pathname).toBe('https://app.xeroflow.io/send/verify')
    expect(url.search).toBe('')
    expect(url.hash).toContain(`verification=${'v'.repeat(43)}`)
    expect(url.hash).toContain(`management=${'m'.repeat(43)}`)
    expect(url.hash).toContain('transfer=44444444-4444-4444-8444-444444444444')
  })
})
