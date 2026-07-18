import { describe, expect, it } from 'vitest'
import { shouldRedirectAppHostPath } from '../../server/middleware/01-app-host-redirect'

describe('app host marketing redirects', () => {
  it('redirects marketing root, trailing slash, and nested marketing routes', () => {
    expect(shouldRedirectAppHostPath('/')).toBe(true)
    expect(shouldRedirectAppHostPath('/pricing/')).toBe(true)
    expect(shouldRedirectAppHostPath('/features/ad-platform-export')).toBe(true)
    expect(shouldRedirectAppHostPath('/resources/quick-start')).toBe(true)
    expect(shouldRedirectAppHostPath('/voice-ai')).toBe(true)
  })

  it('leaves app and auth routes on app.xeroflow.io alone', () => {
    expect(shouldRedirectAppHostPath('/auth/login/')).toBe(false)
    expect(shouldRedirectAppHostPath('/agency/social/publishing')).toBe(false)
  })
})
