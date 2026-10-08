import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { pageStudioInvitedOrigin } from '~~/server/utils/pageStudio/invitedOrigin'

vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io/' }))
afterEach(() => vi.unstubAllEnvs())
const event = (value?: unknown) => ({ context: { cloudflare: { env: { PAGE_STUDIO_INVITED_ORIGIN: value } } } }) as unknown as H3Event

describe('invited Studio origin', () => {
  it('uses the explicit environment origin independently of native signup activation', () => {
    expect(pageStudioInvitedOrigin(event('https://xeroflowpages.com'))).toBe('https://xeroflowpages.com')
  })
  it('keeps older deployments on their configured agency entry', () => {
    vi.stubEnv('PAGE_STUDIO_INVITED_ORIGIN', '')
    expect(pageStudioInvitedOrigin(event())).toBe('https://app.xeroflow.io')
  })
  it.each(['http://xeroflowpages.com', 'https://user:password@example.com', 'https://example.com/studio', 'https://example.com?next=x', 'https://example.com#token=x', '//example.com', true])('rejects malformed configured origins: %s', (value) => {
    expect(() => pageStudioInvitedOrigin(event(value))).toThrow('Page Studio sign-in is temporarily unavailable.')
  })
})
