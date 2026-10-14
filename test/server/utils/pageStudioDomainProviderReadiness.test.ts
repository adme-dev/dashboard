import { describe, expect, it } from 'vitest'
import { domainProviderConfigured } from '../../../workers/page-studio-management/src/domainConfiguration'

const env = { PAGE_STUDIO_CLOUDFLARE_API_TOKEN: 'test', PAGE_STUDIO_CLOUDFLARE_ZONE_ID: 'a'.repeat(32), PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: 'sites.example.com' }
describe('domain provider configuration readiness', () => {
  it('uses the same normalized target as domain attachment', () => {
    expect(domainProviderConfigured({ ...env, PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: ' SITES.EXAMPLE.COM. ' })).toBe(true)
  })
  it.each(Object.keys(env))('requires %s', (key) => {
    expect(domainProviderConfigured({ ...env, [key]: ' ' })).toBe(false)
  })
  it.each(['127.0.0.1', 'https://sites.example.com', ''])('rejects invalid targets %s', (target) => {
    expect(domainProviderConfigured({ ...env, PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: target })).toBe(false)
  })
  it('rejects invalid zone IDs', () => {
    expect(domainProviderConfigured({ ...env, PAGE_STUDIO_CLOUDFLARE_ZONE_ID: 'wrong' })).toBe(false)
  })
})
