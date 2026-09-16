import { describe, expect, it } from 'vitest'
import { domainReady, launchReadiness, type PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'

const state: PageStudioLaunchState = {
  siteId: 'site', siteName: 'Site', siteStatus: 'active', checkpointId: 'checkpoint', digest: 'digest', approvedVersionId: 'version',
  activeReleases: [],
  content: { status: 'ready', publicPages: 2, publicForms: 1 }, plan: { status: 'ready', key: 'trial' }, observedAt: '2026-09-16T00:00:00Z'
}
const domain = { id: 'domain', hostname: 'example.test', environment: 'production', status: 'active', dnsStatus: 'active', tlsStatus: 'active', hostnameStatus: 'active' }
const input = { state, stateFailed: false, domains: [domain], domainsFailed: false, email: { settings: {}, readiness: { sendingEnabled: false } }, emailFailed: false }
describe('launch readiness presentation', () => {
  it('does not present saved form or email settings as successful delivery', () => {
    const items = launchReadiness(input)
    expect(items.find(item => item.id === 'review')?.status).toBe('ready')
    expect(items.find(item => item.id === 'forms')?.status).toBe('required')
    expect(items.find(item => item.id === 'email')?.status).toBe('required')
  })
  it('makes forms and notification setup optional for an informational site', () => {
    const items = launchReadiness({ ...input, state: { ...state, content: { ...state.content, publicForms: 0 } } })
    expect(items.filter(item => ['forms', 'email'].includes(item.id)).every(item => item.status === 'optional')).toBe(true)
    expect(items.some(item => /checkout|commerce/.test(item.label))).toBe(false)
  })
  it('does not retain a ready state from stale data after refresh fails', () => {
    const items = launchReadiness({ ...input, stateFailed: true, domainsFailed: true, emailFailed: true })
    expect(items.every(item => item.status === 'unavailable')).toBe(true)
  })
  it.each(['status', 'dnsStatus', 'tlsStatus', 'hostnameStatus', 'environment'])(
    'requires all domain checks, including %s', (field) => {
      expect(domainReady({ ...domain, [field]: 'pending' })).toBe(false)
    }
  )
  it('links every requirement to a supported workspace action', () => {
    expect(launchReadiness(input).every(item => ['studio', 'forms', 'builds', 'domains', 'settings'].includes(item.target))).toBe(true)
  })
})
